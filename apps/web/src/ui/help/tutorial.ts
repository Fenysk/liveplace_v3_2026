// Ce que le tutoriel retient sur l'appareil, côté navigateur (Écart §8.1, JOURNAL 2026-10-12) : les dessins posés, que la page
// compte, et de quoi tout rejouer. Les bulles vues vivent dans `ui/design/use-seen-bubble.ts`, le conseil de première visite
// dans `ui/hint/use-first-hint.ts`.

import { createPlacementCount } from "../../state/placement-count";
import { restartTutorial } from "../../state/tutorial";
import { seenBubbles } from "../design/use-seen-bubble";
import { restartFirstHint } from "../hint/use-first-hint";

export const placementCount = createPlacementCount(() => window.localStorage);

export const restartDeviceTutorial = (): void =>
  restartTutorial({
    seen: seenBubbles,
    firstHint: { restart: restartFirstHint },
    placements: placementCount,
  });
