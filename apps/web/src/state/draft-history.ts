// L'historique du brouillon (CDC 2026, §8 « Historique ») : les brouillons d'avant, et ceux que Annuler a quittés.
// Pur, en mémoire seulement. Un brouillon ne se modifie jamais, l'historique non plus : chaque règle en rend un nouveau.

import type { Draft } from "./draft";

export type DraftHistory = { past: readonly Draft[]; future: readonly Draft[] };

// Ce qu'une annulation ou un rétablissement rend : le brouillon retrouvé, et l'historique d'après.
export type DraftTravel = { draft: Draft; history: DraftHistory };

export const EMPTY_DRAFT_HISTORY: DraftHistory = { past: [], future: [] };

// Une étape de plus : `before` est le brouillon d'avant, et ce qui pouvait être rétabli s'efface.
export function recordDraftStep(history: DraftHistory, before: Draft): DraftHistory {
  return { past: [...history.past, before], future: [] };
}

export function undoDraftStep(history: DraftHistory, current: Draft): DraftTravel | null {
  const draft = history.past.at(-1);
  if (!draft) return null;
  return { draft, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

export function redoDraftStep(history: DraftHistory, current: Draft): DraftTravel | null {
  const [draft, ...future] = history.future;
  if (!draft) return null;
  return { draft, history: { past: [...history.past, current], future } };
}
