// Un doigt qui glisse en Dessin, Tracé éteint, déplace la vue au lieu de dessiner (Écart §8.1, JOURNAL 2026-10-08) : c'est ce
// que la bulle du Tracé explique. La scène du canvas le rapporte à la fin du geste ; l'état s'efface en quittant le Dessin.

import type { DraftView } from "./draft-store";

export type DraftPan = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  hasPanned(): boolean;
  record(draft: Pick<DraftView, "mode" | "isTouchTracing">): void; // un glissement vient de finir
  clear(): void;
};

export function createDraftPan(): DraftPan {
  const listeners = new Set<() => void>();
  let isPanned = false;

  const set = (next: boolean) => {
    if (next === isPanned) return;
    isPanned = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hasPanned: () => isPanned,
    // Hors Dessin, ou Tracé armé (un doigt trace), le glissement ne dit rien du Tracé.
    record: ({ mode, isTouchTracing }) => {
      if (mode === "draft" && !isTouchTracing) set(true);
    },
    clear: () => set(false),
  };
}
