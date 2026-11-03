// Les dons Ko-fi (CDC des badges §3 et §6, JOURNAL 2026-11-03) : écrits par le web au webhook, reliés à un compte par l'e-mail
// de son compte Twitch (`users.email`, en minuscules), lus pour le titre et la fin du badge Soutien.

import { v } from "convex/values";
import { latestAccountOf, normalizeEmail, normalizeLogin, soleAccountOf } from "../src/donation-link";
import { requireServiceKey } from "../src/service-key";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";

const DONATIONS_PER_CALL = 200; // des dons par appel : une transaction reste petite, le reste suit à la connexion suivante
const UNLINKED_PER_CALL = 100; // des dons non reliés montrés au développeur : les plus récents d'abord

// Ce que Convex dit d'un compte relié : de quoi écrire son miroir `user:<userId>`, jamais son e-mail.
export type LinkedAccount = { userId: string; login: string; displayName: string; avatarUrl: string };
const toLinkedAccount = ({ userId, login, displayName, avatarUrl }: LinkedAccount): LinkedAccount => ({
  userId,
  login,
  displayName,
  avatarUrl,
});

export type RecordedDonation = {
  kofiMessageId: string;
  kofiTransactionId?: string | undefined;
  amountCents: number;
  currency: string;
  donatedAt: number;
  email?: string | undefined;
  kofiName?: string | undefined;
};

// Le seul compte qui porte cet e-mail ; plusieurs comptes ou aucun : `undefined`.
export async function getSoleAccount(
  ctx: Pick<QueryCtx, "db">,
  email: string,
): Promise<LinkedAccount | undefined> {
  const accounts = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(2);
  const userId = soleAccountOf(accounts.map((account) => account.userId));
  const sole = accounts.find((account) => account.userId === userId);
  return sole && toLinkedAccount(sole);
}

const getAccountOf = async (
  ctx: Pick<QueryCtx, "db">,
  userId: string,
): Promise<LinkedAccount | undefined> => {
  const account = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return account ? toLinkedAccount(account) : undefined;
};

// Le compte relié est rendu avec le don : le web écrit son miroir tout de suite. `duplicate` : Ko-fi renvoie le même message tant
// qu'il n'a pas son 200, rien n'est ajouté ; si le don est relié, le compte est rendu aussi, pour qu'un renvoi après une panne de
// Redis réécrive le miroir. Un don relié ne garde ni l'e-mail ni le nom Ko-fi.
export type RecordOutcome =
  | { kind: "linked"; user: LinkedAccount }
  | { kind: "unlinked" }
  | { kind: "duplicate"; user?: LinkedAccount };

const duplicateOf = async (
  ctx: MutationCtx,
  known: { userId?: string | undefined },
): Promise<RecordOutcome> => {
  const user = known.userId ? await getAccountOf(ctx, known.userId) : undefined;
  return user ? { kind: "duplicate", user } : { kind: "duplicate" };
};

// Relié, le don ne garde que son `userId` ; sinon l'e-mail et le nom Ko-fi, tant qu'il attend.
const waitingFields = (email: string | undefined, kofiName: string | undefined, user?: LinkedAccount) =>
  user ? { userId: user.userId } : { ...(email ? { email } : {}), ...(kofiName ? { kofiName } : {}) };

export async function recordDonation(
  ctx: MutationCtx,
  { email: rawEmail, kofiName, ...donation }: RecordedDonation,
): Promise<RecordOutcome> {
  if (!Number.isSafeInteger(donation.amountCents) || donation.amountCents < 1)
    throw new Error("montant du don invalide");
  const known = await ctx.db
    .query("donations")
    .withIndex("by_messageId", (q) => q.eq("kofiMessageId", donation.kofiMessageId))
    .first();
  if (known) return duplicateOf(ctx, known);
  const email = normalizeEmail(rawEmail);
  const user = email ? await getSoleAccount(ctx, email) : undefined;
  await ctx.db.insert("donations", {
    kofiMessageId: donation.kofiMessageId,
    ...(donation.kofiTransactionId ? { kofiTransactionId: donation.kofiTransactionId } : {}),
    amountCents: donation.amountCents,
    currency: donation.currency,
    donatedAt: donation.donatedAt,
    ...waitingFields(email, kofiName, user),
  });
  return user ? { kind: "linked", user } : { kind: "unlinked" };
}

// À chaque connexion, là où l'e-mail est réécrit : les dons non reliés de cette adresse se relient si ce compte est le seul à la
// porter. Rend le nombre de dons reliés.
export async function linkDonationsOf(ctx: MutationCtx, userId: string, email: string): Promise<number> {
  const waiting = await ctx.db
    .query("donations")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(DONATIONS_PER_CALL);
  if (waiting.length === 0 || (await getSoleAccount(ctx, email))?.userId !== userId) return 0;
  for (const donation of waiting)
    await ctx.db.patch(donation._id, { userId, email: undefined, kofiName: undefined });
  return waiting.length;
}

// Supprimer son compte : ses dons reliés partent avec la ligne du compte, dans la même transaction.
export async function deleteDonationsOf(ctx: MutationCtx, userId: string): Promise<number> {
  const donations = await ctx.db
    .query("donations")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const donation of donations) await ctx.db.delete(donation._id);
  return donations.length;
}

// Le cumul à vie, toutes monnaies additionnées telles quelles, et la date du dernier don. `null` : aucun don relié.
export async function getSupportOf(ctx: Pick<QueryCtx, "db">, userId: string) {
  const donations = await ctx.db
    .query("donations")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  if (donations.length === 0) return null;
  return {
    lifetimeCents: donations.reduce((sum, { amountCents }) => sum + amountCents, 0),
    lastDonatedAt: Math.max(...donations.map(({ donatedAt }) => donatedAt)),
  };
}

// La date du dernier don de chaque compte relié dont ce dernier don est postérieur à `since` : le web en tire les titulaires du
// badge (la fin de 12 mois calendaires est celle du domaine, que Convex n'importe pas).
export async function getLastDonationDates(ctx: Pick<QueryCtx, "db">, since: number): Promise<number[]> {
  const recent = await ctx.db
    .query("donations")
    .withIndex("by_donatedAt", (q) => q.gte("donatedAt", since))
    .collect();
  const lastOf = new Map<string, number>();
  for (const { userId, donatedAt } of recent)
    if (userId !== undefined) lastOf.set(userId, Math.max(lastOf.get(userId) ?? donatedAt, donatedAt));
  return [...lastOf.values()];
}

export type UnlinkedDonation = { donationId: string; donatedAt: number; email?: string; kofiName?: string };

// Les dons qui attendent un compte, du plus récent au plus ancien. Jamais le montant : le développeur choisit le compte, pas la somme.
export async function listUnlinkedDonations(ctx: Pick<QueryCtx, "db">): Promise<UnlinkedDonation[]> {
  const waiting = await ctx.db
    .query("donations")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .order("desc")
    .take(UNLINKED_PER_CALL);
  return waiting.map(({ _id, donatedAt, email, kofiName }) => ({
    donationId: _id,
    donatedAt,
    ...(email ? { email } : {}),
    ...(kofiName ? { kofiName } : {}),
  }));
}

export type DonationLinkRefusal = "unknown_donation" | "already_linked" | "unknown_account";

// Le lien à la main : le compte se trouve par son pseudo, le don prend son `userId` et perd l'e-mail et le nom Ko-fi. Rien ne change
// si le pseudo est inconnu.
export async function linkDonationByLogin(
  ctx: MutationCtx,
  rawDonationId: string,
  rawLogin: string,
): Promise<{ ok: true; value: LinkedAccount } | { ok: false; error: DonationLinkRefusal }> {
  const donationId = ctx.db.normalizeId("donations", rawDonationId);
  const donation = donationId && (await ctx.db.get(donationId));
  if (!donationId || !donation) return { ok: false, error: "unknown_donation" };
  if (donation.userId !== undefined) return { ok: false, error: "already_linked" };
  const accounts = await ctx.db
    .query("users")
    .withIndex("by_login", (q) => q.eq("login", normalizeLogin(rawLogin)))
    .collect();
  const account = latestAccountOf(accounts);
  if (!account) return { ok: false, error: "unknown_account" };
  await ctx.db.patch(donationId, { userId: account.userId, email: undefined, kofiName: undefined });
  return { ok: true, value: toLinkedAccount(account) };
}

export const record = mutation({
  args: {
    serviceKey: v.string(),
    kofiMessageId: v.string(),
    kofiTransactionId: v.optional(v.string()),
    amountCents: v.number(),
    currency: v.string(),
    donatedAt: v.number(),
    email: v.optional(v.string()),
    kofiName: v.optional(v.string()),
  },
  handler: async (ctx, { serviceKey, ...donation }) => {
    requireServiceKey(serviceKey);
    return recordDonation(ctx, donation);
  },
});

export const getSupport = query({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, { serviceKey, userId }) => {
    requireServiceKey(serviceKey);
    return getSupportOf(ctx, userId);
  },
});

export const getLastDates = query({
  args: { serviceKey: v.string(), since: v.number() },
  handler: async (ctx, { serviceKey, since }) => {
    requireServiceKey(serviceKey);
    return getLastDonationDates(ctx, since);
  },
});

export const listUnlinked = query({
  args: { serviceKey: v.string() },
  handler: async (ctx, { serviceKey }) => {
    requireServiceKey(serviceKey);
    return listUnlinkedDonations(ctx);
  },
});

export const linkByLogin = mutation({
  args: { serviceKey: v.string(), donationId: v.string(), login: v.string() },
  handler: async (ctx, { serviceKey, donationId, login }) => {
    requireServiceKey(serviceKey);
    return linkDonationByLogin(ctx, donationId, login);
  },
});
