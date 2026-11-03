// Le webhook de Ko-fi (JOURNAL 2026-11-03). Les champs de Ko-fi sont en snake_case et ne sortent pas d'ici. Le corps est un
// formulaire dont l'unique champ `data` porte le JSON. Chaque champ se lit par son nom, du type attendu : tout ce qui n'est pas
// nommé ici (l'adresse postale `shipping`, `discord_*`, `url`, `shop_items`, `tier_name`, le message) n'est jamais lu.

import { createHash, timingSafeEqual } from "node:crypto";
import type { KofiDonation, KofiWebhook } from "@liveplace/domain/ports";
import { z } from "zod";

// « Donation » dans les exemples de Ko-fi, « Tip » dans son texte ; chaque paiement d'un abonnement est un don. « Commission » et
// « Shop Order » sont des achats.
const DONATION_TYPES = new Set(["Donation", "Tip", "Subscription"]);

const DEFAULT_CURRENCY = "EUR"; // la page Ko-fi de LivePlace est en euros
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 100;

type Fields = Record<string, unknown>;

// Un champ facultatif absent, nul ou d'un autre type vaut `undefined` : il ne rejette jamais un don.
const textOf = (fields: Fields, name: string): string | undefined => {
  const value = fields[name];
  return typeof value === "string" ? value : undefined;
};

const amountOf = (fields: Fields, name: string): string | number | undefined => {
  const value = fields[name];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
};

// Une comparaison ordinaire laisse deviner le jeton octet par octet ; deux empreintes ont toujours la même longueur.
const digest = (text: string): Buffer => createHash("sha256").update(text).digest();
const isSecretSent = (expected: string, sent: string): boolean =>
  timingSafeEqual(digest(expected), digest(sent));

// « 3.00 » devient 300, sans passer par un flottant. Au-delà de deux décimales, le reste est coupé. `null` : pas un montant.
const toCents = (amount: string | number): number | null => {
  const match = /^(\d{1,9})(?:[.,](\d+))?$/.exec(String(amount).trim());
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
};

// La date que Ko-fi donne, sinon celle de la réception.
const toDonatedAt = (timestamp: string | undefined, nowMs: number): number => {
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : nowMs;
};

const toDonation = (fields: Fields, nowMs: number): KofiDonation | null => {
  const amount = amountOf(fields, "amount");
  const amountCents = amount === undefined ? null : toCents(amount);
  const messageId = textOf(fields, "message_id");
  if (!messageId || amountCents === null) return null;
  const transactionId = textOf(fields, "kofi_transaction_id");
  const email = textOf(fields, "email")?.trim().slice(0, MAX_EMAIL_LENGTH);
  const kofiName = textOf(fields, "from_name")?.trim().slice(0, MAX_NAME_LENGTH);
  return {
    messageId,
    ...(transactionId ? { transactionId } : {}),
    amountCents,
    currency: textOf(fields, "currency")?.trim().toUpperCase().slice(0, 8) || DEFAULT_CURRENCY,
    donatedAt: toDonatedAt(textOf(fields, "timestamp"), nowMs),
    ...(email ? { email } : {}),
    ...(kofiName ? { kofiName } : {}),
  };
};

// Le corps brut du POST : `data=<JSON encodé>`. `undefined` : pas ce que Ko-fi enverrait.
const parseFields = (body: string): Fields | undefined => {
  const json = new URLSearchParams(body).get("data");
  if (json === null) return undefined;
  try {
    const parsed = z.record(z.string(), z.unknown()).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

// Le jeton se vérifie avant de regarder le type : un faux jeton ne dit jamais si un type compte.
const toWebhookEvent = (secret: string, fields: Fields, nowMs: number): ReturnType<KofiWebhook["read"]> => {
  const sent = textOf(fields, "verification_token");
  const type = textOf(fields, "type");
  if (sent === undefined || type === undefined) return { ok: false, error: "invalid" };
  if (!isSecretSent(secret, sent)) return { ok: false, error: "unauthorized" };
  if (!DONATION_TYPES.has(type)) return { ok: true, value: { kind: "ignored" } };
  const donation = toDonation(fields, nowMs);
  if (!donation) return { ok: false, error: "invalid" };
  // Un paiement à zéro (un palier gratuit) n'est pas un don.
  return {
    ok: true,
    value: donation.amountCents < 1 ? { kind: "ignored" } : { kind: "donation", donation },
  };
};

// `secret` à `null` : pas de jeton posé, rien ne passe (défaut fermé).
export function createKofiWebhook(secret: string | null): KofiWebhook {
  return {
    read(body, nowMs) {
      if (secret === null) return { ok: false, error: "unconfigured" };
      const fields = parseFields(body);
      return fields ? toWebhookEvent(secret, fields, nowMs) : { ok: false, error: "invalid" };
    },
  };
}
