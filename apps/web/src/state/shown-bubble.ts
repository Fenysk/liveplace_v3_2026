// La bulle d'aide à l'écran (Écart §8.1, JOURNAL 2026-10-08 et 2026-10-12) : jamais deux à la fois. Celle qu'on veut ne paraît qu'une
// fois la précédente effacée, le temps de son fondu ; une bulle close qui reste (`isLingering`) garde sa place le temps d'être lue.
// L'horloge est injectée : les tests l'avancent sans rien attendre.

import { BUBBLE_LINGER_MS, type HelpBubble } from "./help-bubbles";

export type ShownBubbleClock = { wait(ms: number, run: () => void): () => void }; // rend de quoi annuler l'attente

export type ShownBubbleDeps = {
  clock: ShownBubbleClock;
  fadeMs: () => number; // lue au moment d'attendre : la durée du fondu suit le mouvement réduit
};

export type ShownBubble = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getShown(): HelpBubble | undefined;
  // `wanted` : la bulle que l'écran demande, ou aucune ; `isLingering` : la bulle montrée est close et reste.
  follow(wanted: HelpBubble | undefined, isLingering: boolean): void;
  dispose(): void;
};

export function createShownBubble({ clock, fadeMs }: ShownBubbleDeps): ShownBubble {
  const listeners = new Set<() => void>();
  let shown: HelpBubble | undefined;
  let wanted: HelpBubble | undefined;
  let isLingering = false;
  let cancelLinger: (() => void) | undefined;
  let cancelArrival: (() => void) | undefined;
  let arriving: HelpBubble | undefined; // celle que l'attente en cours fait paraître

  const setShown = (next: HelpBubble | undefined) => {
    shown = next;
    for (const listener of listeners) listener();
  };

  const stopLinger = () => {
    cancelLinger?.();
    cancelLinger = undefined;
  };

  const stopArrival = () => {
    cancelArrival?.();
    cancelArrival = undefined;
    arriving = undefined;
  };

  // La prochaine étape, d'après ce qu'on veut et ce qui est à l'écran : rien, garder, effacer, ou faire paraître.
  const settle = () => {
    if (wanted === shown) {
      stopLinger();
      stopArrival();
      return;
    }
    if (shown !== undefined) {
      if (isLingering) {
        // Une seule attente : un autre souhait pendant ce temps ne la repousse pas.
        cancelLinger ??= clock.wait(BUBBLE_LINGER_MS, () => {
          cancelLinger = undefined;
          setShown(undefined);
          settle();
        });
        return;
      }
      stopLinger();
      setShown(undefined);
    }
    if (wanted === undefined) {
      stopArrival();
      return;
    }
    if (arriving === wanted) return;
    stopArrival();
    arriving = wanted;
    cancelArrival = clock.wait(fadeMs(), () => {
      cancelArrival = undefined;
      arriving = undefined;
      setShown(wanted);
    });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getShown: () => shown,
    follow(nextWanted, nextIsLingering) {
      wanted = nextWanted;
      isLingering = nextIsLingering;
      settle();
    },
    dispose() {
      stopLinger();
      stopArrival();
    },
  };
}
