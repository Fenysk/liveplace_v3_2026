// Les vignettes « Signaler un dessin » et « Efface les dessins gênants » : le même parcours, calculé d'après le temps. Une souris clique un
// gribouillis gris sur la fresque, la pill Inspection s'ouvre à droite, la souris clique son bouton (Signaler, ou Effacer ses dessins), une
// petite fenêtre demande confirmation, la souris clique le bouton qui confirme.
//   - Signaler : la fenêtre se ferme, le bouton dit « Signalé » et le toast « Signalement envoyé » paraît. Le gribouillis reste : signaler
//     ne retire rien, ce sont les modérateurs qui décident.
//   - Effacer : la fenêtre se ferme et le gribouillis disparaît d'un coup (la modération ne s'anime jamais dans le jeu).
// Puis un temps de repos, tout s'efface en fondu, le gribouillis revient, et la boucle repart. L'image fixe : le moment qui suit la
// confirmation, sans souris.

import { INSPECTED_SPOT } from "./inspection-scene";
import { click, loopTime, spanIn, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const INSPECTION_LOOP_MS = 8400;
export const REPORT_RESTING_MS = 5800;
export const CLEAR_RESTING_MS = 5800;

export type InspectionKind = "report" | "clear";

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
const CLICK_CELL_MS = 1500;
const PILL_OPENS_FROM_MS = 1560;
const PILL_OPENS_TO_MS = 1840;
const CLICK_ROW_MS = 3000;
const WINDOW_OPENS_FROM_MS = 3080;
const WINDOW_OPENS_TO_MS = 3340;
const CLICK_CONFIRM_MS = 4800;
const WINDOW_CLOSES_FROM_MS = 4880;
const WINDOW_CLOSES_TO_MS = 5130;
const TOAST_FROM_MS = 5000;
const TOAST_TO_MS = 5250;
const FADE_OUT_FROM_MS = 7300;
const FADE_OUT_TO_MS = 7800;
const SCRIBBLE_BACK_FROM_MS = 7800;
const SCRIBBLE_BACK_TO_MS = 8200;

// Où la pointe se pose, en unités de la vignette (`ax`, `ay`) plus un écart en unités de la pill (`bx`, `by`) : la pill Inspection est
// ancrée au bord droit, à mi-hauteur ; la fenêtre, au centre.
const START_SPOT: PointerSpot = { ax: 94, ay: 63, bx: 0, by: 0 };
const CELL_SPOT: PointerSpot = { ...INSPECTED_SPOT, bx: 0, by: 0 };
export const INSPECTION_ANCHOR = { ax: 104, ay: 36 } as const;
export const WINDOW_ANCHOR = { ax: 56, ay: 36 } as const;
const ROW_SPOTS: Record<InspectionKind, PointerSpot> = {
  report: { ...INSPECTION_ANCHOR, bx: -31.4, by: 12.4 },
  clear: { ...INSPECTION_ANCHOR, bx: -27.8, by: 12.4 },
};
const CONFIRM_SPOT: PointerSpot = { ...WINDOW_ANCHOR, bx: 13.4, by: 7.5 };

const waypointsOf = (kind: InspectionKind) => [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  { atMs: CLICK_CELL_MS - 100, spot: CELL_SPOT },
  { atMs: CLICK_CELL_MS + 250, spot: CELL_SPOT },
  { atMs: CLICK_ROW_MS - 150, spot: ROW_SPOTS[kind] },
  { atMs: CLICK_ROW_MS + 150, spot: ROW_SPOTS[kind] },
  { atMs: CLICK_CONFIRM_MS - 150, spot: CONFIRM_SPOT },
];

export type InspectionMoment = {
  ring: number; // le contour de la case inspectée, de 0 à 1
  pill: number; // la pill Inspection, de 0 (fermée) à 1
  window: number; // la fenêtre de confirmation et le voile derrière, de 0 à 1
  scribble: number; // l'opacité du gribouillis : 1 sauf quand il est effacé
  toast: number; // le toast « Signalement envoyé », de 0 à 1 ; toujours 0 en Effacer
  isDone: boolean; // Signaler : le bouton dit « Signalé » ; toujours faux en Effacer
  rowTap: number; // l'appui sur le bouton de la pill, de 0 à 1
  confirmTap: number; // l'appui sur le bouton de la fenêtre
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce à chaque clic
};

// Le gribouillis : Signaler le laisse. Effacer l'ôte d'un coup à la confirmation, et il revient en fondu quand tout est reparti.
const scribbleAt = (isReport: boolean, t: number): number => {
  if (isReport || t < WINDOW_CLOSES_FROM_MS) return 1;
  return t < SCRIBBLE_BACK_FROM_MS ? 0 : spanIn(t, SCRIBBLE_BACK_FROM_MS, SCRIBBLE_BACK_TO_MS);
};

export const inspectionAt = (kind: InspectionKind, timeMs: number): InspectionMoment => {
  const t = loopTime(timeMs, INSPECTION_LOOP_MS);
  const keep = spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS);
  const isReport = kind === "report";
  const rowTap = click(t, CLICK_ROW_MS);
  const confirmTap = click(t, CLICK_CONFIRM_MS);
  return {
    ring: spanIn(t, CLICK_CELL_MS, CLICK_CELL_MS + 120) * keep,
    pill: spanIn(t, PILL_OPENS_FROM_MS, PILL_OPENS_TO_MS) * keep,
    window:
      spanIn(t, WINDOW_OPENS_FROM_MS, WINDOW_OPENS_TO_MS) *
      spanOut(t, WINDOW_CLOSES_FROM_MS, WINDOW_CLOSES_TO_MS),
    scribble: scribbleAt(isReport, t),
    toast: isReport ? spanIn(t, TOAST_FROM_MS, TOAST_TO_MS) * keep : 0,
    isDone: isReport && t >= WINDOW_CLOSES_FROM_MS && t < FADE_OUT_TO_MS,
    rowTap,
    confirmTap,
    pointer: {
      ...spotAlong(waypointsOf(kind), t),
      opacity: pointerOpacity(t, POINTER_APPEARS_FROM_MS, POINTER_APPEARS_TO_MS, keep),
    },
    press: Math.max(click(t, CLICK_CELL_MS), rowTap, confirmTap),
  };
};
