// Le badge Soutien (CDC des badges §3, JOURNAL 2026-11-03) : son titre d'après le cumul à vie des dons, et sa fin. Deux
// fonctions pures ; le montant compte tel quel, sans conversion de monnaie.

import type { Timestamp } from "./index";

export const SUPPORT_TITLES = ["supporter", "regular", "drivingForce", "pillar", "keystone"] as const;
export type SupportTitle = (typeof SUPPORT_TITLES)[number];

// Dès combien de centimes, en cumul de tous ses dons ; le premier don suffit pour le premier titre.
const SUPPORT_THRESHOLDS: readonly { title: SupportTitle; fromCents: number }[] = [
  { title: "supporter", fromCents: 1 },
  { title: "regular", fromCents: 1000 },
  { title: "drivingForce", fromCents: 2500 },
  { title: "pillar", fromCents: 5000 },
  { title: "keystone", fromCents: 10000 },
];

// `null` : aucun don. Le cumul ne baisse jamais, donc le titre non plus.
export function supportTitle(lifetimeCents: number): SupportTitle | null {
  let reached: SupportTitle | null = null;
  for (const { title, fromCents } of SUPPORT_THRESHOLDS) if (lifetimeCents >= fromCents) reached = title;
  return reached;
}

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// Le badge reste 12 mois calendaires après le dernier don, en UTC : le 29 février devient le 28 de l'année suivante.
export function supportEndsAt(lastDonatedAt: Timestamp): Timestamp {
  const donated = new Date(lastDonatedAt);
  const year = donated.getUTCFullYear() + 1;
  const month = donated.getUTCMonth();
  return Date.UTC(
    year,
    month,
    Math.min(donated.getUTCDate(), daysInMonth(year, month)),
    donated.getUTCHours(),
    donated.getUTCMinutes(),
    donated.getUTCSeconds(),
    donated.getUTCMilliseconds(),
  );
}

// 12 mois calendaires font au plus 366 jours : un dernier don plus vieux que cela n'a plus de badge. Le début de ce qu'il faut lire.
const SUPPORT_LONGEST_MS = 366 * 24 * 3600 * 1000;
export const supportWindowStart = (nowMs: Timestamp): Timestamp => nowMs - SUPPORT_LONGEST_MS;

// Les titulaires du badge : les comptes dont le dernier don + 12 mois n'est pas passé. Une date par compte.
export const countSupportHolders = (lastDonatedAts: readonly Timestamp[], nowMs: Timestamp): number =>
  lastDonatedAts.filter((lastDonatedAt) => nowMs < supportEndsAt(lastDonatedAt)).length;
