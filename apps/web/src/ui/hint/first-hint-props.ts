// Ce que montre le conseil de première visite à un instant (Écart §8.1, JOURNAL 2026-10-08) : ce que dit son état,
// et ce que la page en cache. Des données pures, sans React.

import { type FirstHintView, HINT_STEPS } from "../../state/first-hint";
import type { FirstHintProps } from "./first-hint";

// Une visite regarde le canvas un moment avant que la bulle paraisse ; le dernier point reste rempli deux secondes avant son
// fondu (Écart §8.1, JOURNAL 2026-10-09).
export const HINT_SHOW_DELAY_MS = 1200;
export const HINT_CLOSE_BEAT_MS = 2000;

export type HintAside = {
  isReady: boolean; // le canvas est affiché depuis un moment
  isDrafting: boolean; // en Dessin, la bulle se cache (elle revient en Vue)
  isInspecting: boolean; // la feuille d'inspection est ouverte
  isYielding: boolean; // une bulle d'aide est montrée ou attend son tour : une seule bulle à la fois (JOURNAL 2026-10-08)
};

export type FirstHintContext = HintAside & {
  isSettled: boolean; // le dernier point est resté rempli assez longtemps
};

const isAside = ({ isReady, isDrafting, isInspecting, isYielding }: HintAside): boolean =>
  !isReady || isDrafting || isInspecting || isYielding;

// Le dernier point se compte quand la bulle le montre : cachée au troisième geste, elle ne perd pas son temps sous la
// feuille, il court à son retour (Écart §8.1, JOURNAL 2026-10-09).
export const isHintBeating = (view: FirstHintView, aside: HintAside): boolean =>
  view.status === "done" && !isAside(aside);

// `undefined` : rien à monter (PC, déjà vu, stockage refusé). Les props d'une bulle cachée la gardent dans la page, pour
// qu'elle revienne, ou s'efface, en fondu.
export function toFirstHintProps(view: FirstHintView, context: FirstHintContext): FirstHintProps | undefined {
  if (view.status === "off") return undefined;
  const isShown = !isAside(context);
  if (view.status === "done")
    return { doneCount: HINT_STEPS.length, isVisible: isShown && !context.isSettled };
  return { doneCount: view.done.length, isVisible: isShown };
}
