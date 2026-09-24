// Les couleurs récentes de la feuille Dessin, sur mobile (design system, Mobile) : quatre, dans un ordre stable.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";

// Celles de la maquette : rouge, bleu, vert, jaune.
export const INITIAL_RECENT_COLOR_INDEXES: readonly number[] = [5, 28, 19, 9];

// Une couleur prise dans la palette complète entre en tête, la plus ancienne sort ; une couleur déjà là ne bouge pas.
export function rememberColorIndex(
  recentColorIndexes: readonly number[],
  colorIndex: number,
): readonly number[] {
  if (colorIndex === TRANSPARENT_COLOR_INDEX || recentColorIndexes.includes(colorIndex))
    return recentColorIndexes;
  return [colorIndex, ...recentColorIndexes.slice(0, INITIAL_RECENT_COLOR_INDEXES.length - 1)];
}
