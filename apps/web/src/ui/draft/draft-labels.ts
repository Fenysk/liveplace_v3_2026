// Les mots des boutons de la pill Dessin selon le brouillon et la jauge (Écart §9.3, JOURNAL 2026-10-08).

import type { Locale } from "../locale/locale";
import { DRAFT_TEXTS } from "./draft-texts";

const SECONDS_PER_MINUTE = 60;
const TICK_MS = 1000;

// « 12 s », puis « 1 min 05 » dès la minute.
export function formatWait(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} s`;
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)} min ${rest}`;
}

export type SubmitWords = { lead: string; label: string };

// `waitSeconds` : plus aucune charge et rien à poser, la seconde où la jauge en redonne une. Le mot de devant d'« Attendre
// 12 s » est à part : sur un écran étroit, le bouton garde « 12 s » seul (button.css).
export const submitWords = (
  draftSize: number,
  waitSeconds: number | undefined,
  locale: Locale,
): SubmitWords => {
  const t = DRAFT_TEXTS[locale];
  if (waitSeconds !== undefined) return { lead: t.waitLead, label: formatWait(waitSeconds) };
  return { lead: "", label: draftSize > 0 ? `${t.confirm} · ${draftSize}` : t.confirm };
};

export const submitLabel = (draftSize: number, waitSeconds: number | undefined, locale: Locale): string => {
  const { lead, label } = submitWords(draftSize, waitSeconds, locale);
  return `${lead}${label}`;
};

// Le compte à rebours de l'attente : la seconde entière qu'il reste, jamais zéro (à zéro, la jauge a rendu sa charge).
export const waitSecondsOf = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / TICK_MS));

// Jusqu'à la prochaine seconde entière du compte à rebours : celle où « Attendre 12 s » devient « 11 s ». Sans échéance, une seconde.
export const msToNextSecond = (endsAt: number | undefined, nowMs: number): number =>
  endsAt === undefined ? TICK_MS : (((endsAt - nowMs) % TICK_MS) + TICK_MS) % TICK_MS || TICK_MS;
