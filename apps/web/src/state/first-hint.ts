// Le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08) : les gestes que l'appareil a déjà faits, retenus dans son navigateur.
// Trois gestes distincts ; le troisième ferme le conseil pour de bon. Sans écran tactile ni stockage lisible, il ne s'ouvre jamais.

import type { BubbleStorage, SeenBubbles } from "./seen-bubbles";

export const HINT_STEPS = ["pan", "zoom", "inspect"] as const;
export type HintStep = (typeof HINT_STEPS)[number];

// `open` : 0 à 2 gestes faits. `done` : le dernier vient d'être fait, la page ferme la bulle après un temps.
// `off` : rien à montrer (PC, déjà vu, stockage refusé).
export type FirstHintView =
  | { status: "off" }
  | { status: "open"; done: readonly HintStep[] }
  | { status: "done" };

export type FirstHintDeps = {
  seen: SeenBubbles;
  getStorage: () => BubbleStorage;
  isTouchScreen: () => boolean;
};

export type FirstHint = {
  subscribe(listener: () => void): () => void;
  getView(): FirstHintView;
  record(step: HintStep): void;
};

// La fin est la bulle vue (`seen`) ; la progression, elle, ne sert qu'à reprendre là où l'appareil s'était arrêté.
export const FIRST_HINT_KEY = "first-hint";
const STEPS_STORAGE_KEY = "liveplace:first-hint-steps";

const OFF: FirstHintView = { status: "off" };
const DONE: FirstHintView = { status: "done" };

const isHintStep = (value: string): value is HintStep => HINT_STEPS.some((step) => step === value);

const parseSteps = (stored: string | null): HintStep[] => [
  ...new Set((stored ?? "").split(",").filter(isHintStep)),
];

export function createFirstHint({ seen, getStorage, isTouchScreen }: FirstHintDeps): FirstHint {
  const listeners = new Set<() => void>();
  let view: FirstHintView | undefined;

  const setView = (next: FirstHintView) => {
    view = next;
    for (const listener of listeners) listener();
  };

  // Lue au premier accès, dans le navigateur seulement : l'écran et le stockage n'existent pas sur le serveur.
  const load = (): FirstHintView => {
    if (!isTouchScreen() || seen.isSeen(FIRST_HINT_KEY)) return OFF;
    try {
      return { status: "open", done: parseSteps(getStorage().getItem(STEPS_STORAGE_KEY)) };
    } catch (error) {
      console.warn("conseil de première visite : stockage refusé, conseil retiré", error);
      return OFF;
    }
  };

  const getView = (): FirstHintView => {
    view ??= load();
    return view;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView,
    record(step) {
      const current = getView();
      if (current.status !== "open" || current.done.includes(step)) return;
      const done = [...current.done, step];
      if (done.length === HINT_STEPS.length) {
        seen.markSeen(FIRST_HINT_KEY);
        setView(DONE);
        return;
      }
      try {
        getStorage().setItem(STEPS_STORAGE_KEY, done.join(","));
      } catch (error) {
        console.warn("conseil de première visite : progression non retenue, conseil retiré", error);
        setView(OFF);
        return;
      }
      setView({ status: "open", done });
    },
  };
}
