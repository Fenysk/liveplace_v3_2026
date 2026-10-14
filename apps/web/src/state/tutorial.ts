// Rejouer le tutoriel (Écart §8.1, JOURNAL 2026-10-12) : ce qu'il retient sur l'appareil repart de zéro. Un seul endroit dit ce
// que c'est, pour qu'une mémoire de plus ne soit pas oubliée : les bulles vues, les gestes du conseil de première visite, les
// dessins posés. Chaque bulle revient ensuite à son moment.

import { FIRST_HINT_KEY, type FirstHint } from "./first-hint";
import { HELP_BUBBLES } from "./help-bubbles";
import type { PlacementCount } from "./placement-count";
import type { SeenBubbles } from "./seen-bubbles";

export type TutorialMemory = {
  seen: SeenBubbles;
  firstHint: Pick<FirstHint, "restart">;
  placements: Pick<PlacementCount, "forget">;
};

export function restartTutorial({ seen, firstHint, placements }: TutorialMemory): void {
  // Les bulles d'abord : le conseil se rouvre d'après elles.
  seen.forget([...HELP_BUBBLES, FIRST_HINT_KEY]);
  firstHint.restart();
  placements.forget();
}
