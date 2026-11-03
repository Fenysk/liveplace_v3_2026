// L'infobulle d'un badge (JOURNAL 2026-11-03) : dans la couche supérieure du navigateur (`popover`), donc posée à l'écran, pas dans
// la pill. Au-dessus du badge, centrée ; sous lui quand le haut de l'écran manque de place ; jamais hors de l'écran.

export type TipBox = { left: number; top: number; width: number; height: number };

export const placeTip = (
  anchor: TipBox,
  tip: Pick<TipBox, "width" | "height">,
  screen: { width: number },
  gap: number,
): Pick<TipBox, "left" | "top"> => {
  const centered = anchor.left + anchor.width / 2 - tip.width / 2;
  const above = anchor.top - gap - tip.height;
  return {
    left: Math.max(gap, Math.min(centered, screen.width - tip.width - gap)),
    top: above >= gap ? above : anchor.top + anchor.height + gap,
  };
};
