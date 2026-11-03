// Les comptes (§8.2) : écrits par le web au callback OAuth, lus par le loader de `/{login}`.

import { type Infer, v } from "convex/values";
import { latestAccountOf, normalizeEmail } from "../src/donation-link";
import { requireServiceKey } from "../src/service-key";
import { toUserPatch } from "../src/user-patch";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { deleteDonationsOf, linkDonationsOf } from "./donations";
import { accountDeletionTrigger } from "./schema";

const DETACHED_PER_CALL = 200; // des comptes venus de sa page par appel : une transaction reste petite

export type SignedInAccount = {
  userId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  email?: string | undefined;
  discoveredViaUserId?: string | undefined;
};

// §8.1 : l'e-mail à chaque connexion, le lien de découverte à la création seulement. L'e-mail s'écrit en minuscules : c'est sous
// cette forme que `by_email` relie un don Ko-fi (JOURNAL 2026-11-03).
export async function upsertAccount(
  ctx: MutationCtx,
  { email: rawEmail, discoveredViaUserId, ...user }: SignedInAccount,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", user.userId))
    .unique();
  if (existing) {
    // Sans e-mail dans ce jeton, celui d'avant part : la réduction de portée (contrat Twitch VI.F).
    await ctx.db.patch(existing._id, toUserPatch({ ...user, email }, now));
  } else {
    await ctx.db.insert("users", {
      ...user,
      ...(email ? { email } : {}),
      ...(discoveredViaUserId ? { discoveredViaUserId } : {}),
      createdAt: now,
      lastSignInAt: now,
    });
  }
  // Les dons Ko-fi qui attendaient cette adresse se relient, si ce compte est le seul à la porter.
  if (email) await linkDonationsOf(ctx, user.userId, email);
}

export const upsertFromTwitch = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    login: v.string(),
    displayName: v.string(),
    avatarUrl: v.string(),
    email: v.optional(v.string()),
    discoveredViaUserId: v.optional(v.string()),
  },
  handler: async (ctx, { serviceKey, ...account }) => {
    requireServiceKey(serviceKey);
    await upsertAccount(ctx, account);
  },
});

export const getByLogin = query({
  args: { serviceKey: v.string(), login: v.string() },
  handler: async (ctx, { serviceKey, login }) => {
    requireServiceKey(serviceKey);
    const users = await ctx.db
      .query("users")
      .withIndex("by_login", (q) => q.eq("login", login))
      .collect();
    const latest = latestAccountOf(users);
    if (!latest) return null;
    return {
      userId: latest.userId,
      login: latest.login,
      displayName: latest.displayName,
      avatarUrl: latest.avatarUrl,
    };
  },
});

// §7.4 : le miroir `user:<id>` de ces personnes, perdu avec Redis. Jamais l'e-mail. Une lecture par
// identifiant dans une seule requête : la récupération en demande par lots, et seulement pour un canvas à remettre.
export const listByUserIds = query({
  args: { serviceKey: v.string(), userIds: v.array(v.string()) },
  handler: async (ctx, { serviceKey, userIds }) => {
    requireServiceKey(serviceKey);
    const found = await Promise.all(
      userIds.map((userId) =>
        ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .first(),
      ),
    );
    return found.flatMap((user) =>
      user
        ? [
            {
              userId: user.userId,
              login: user.login,
              displayName: user.displayName,
              ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            },
          ]
        : [],
    );
  },
});

// CDC §8, Supprimer son compte : la ligne du compte, e-mail compris, et la preuve de son effacement dans la même
// transaction (RGPD art. 5.2), par `runId` : une reprise qui repasse ici ne double rien. Rend ce qu'il faut pour oublier
// ses caches ; `null` : la ligne était déjà partie.
export async function deleteAccountRows(
  ctx: MutationCtx,
  {
    userId,
    runId,
    deletedAt,
    trigger,
    ownedCanvases,
  }: {
    userId: string;
    runId: string;
    deletedAt: number;
    trigger: Infer<typeof accountDeletionTrigger>;
    ownedCanvases: number;
  },
) {
  const rows = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
  await deleteDonationsOf(ctx, userId); // CDC des badges §6 : ses dons reliés partent avec lui
  const proven = await ctx.db
    .query("accountDeletions")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .first();
  if (!proven)
    await ctx.db.insert("accountDeletions", {
      runId,
      deletedAt,
      trigger,
      erased: { hasEmail: rows.some(({ email }) => email !== undefined), ownedCanvases },
    });
  const [first] = rows;
  return first ? { login: first.login, avatarUrl: first.avatarUrl } : null;
}

export const deleteByUserId = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    runId: v.string(),
    deletedAt: v.number(),
    trigger: accountDeletionTrigger,
    ownedCanvases: v.number(),
  },
  handler: async (ctx, { serviceKey, ...deletion }) => {
    requireServiceKey(serviceKey);
    return deleteAccountRows(ctx, deletion);
  },
});

// Les comptes venus de la page de ce streamer ne le nomment plus. Par lots de `DETACHED_PER_CALL` : le client rappelle tant
// qu'il en reste.
export const detachDiscovered = mutation({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, { serviceKey, userId }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("users")
      .withIndex("by_discoveredVia", (q) => q.eq("discoveredViaUserId", userId))
      .take(DETACHED_PER_CALL);
    for (const row of rows) await ctx.db.patch(row._id, { discoveredViaUserId: undefined });
    return rows.length;
  },
});
