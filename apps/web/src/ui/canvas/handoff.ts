// Le passage d'une scène à la suivante quand la page suit une autre fresque (use-follow-active-canvas.ts) : la dernière surface
// peinte de celle qui s'en va, que la nouvelle garde à l'écran jusqu'à l'arrivée de la sienne. Périmée au bout de 2 s.
// Le jeu et la vue OBS s'en servent.
export type Handoff = { surface: HTMLCanvasElement | null; leftAt: number };
export const createHandoff = (): Handoff => ({ surface: null, leftAt: 0 });
const HANDOFF_MAX_AGE_MS = 2000;

export const takeLeftBehind = (handoff: Handoff | undefined): HTMLCanvasElement | null => {
  if (!handoff) return null;
  const { surface, leftAt } = handoff;
  handoff.surface = null;
  return performance.now() - leftAt <= HANDOFF_MAX_AGE_MS ? surface : null;
};
