// La rangée des couleurs récentes, dans la feuille Dessin sur mobile (design system, Mobile) : cinq couleurs, jamais
// celle du bouton de la couleur actuelle. Les cases ne bougent que pour une couleur nouvelle.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";

// Celles de la maquette (rouge, bleu, vert, jaune) et le blanc. Le noir, couleur active à l'arrivée, est sur le bouton.
export const INITIAL_RECENT_COLOR_INDEXES: readonly number[] = [5, 28, 19, 9, 42];

// Une couleur prend le bouton ; celle qu'elle remplace va dans la rangée. Si la nouvelle y était, les deux s'échangent
// sur place, et rien d'autre ne bouge. Sinon, la remplacée entre en tête et la plus ancienne sort.
export function rememberColorIndex(
  recentColorIndexes: readonly number[],
  replacedColorIndex: number,
  colorIndex: number,
): readonly number[] {
  if (colorIndex === TRANSPARENT_COLOR_INDEX || colorIndex === replacedColorIndex) return recentColorIndexes;
  if (recentColorIndexes.includes(colorIndex))
    return recentColorIndexes.map((index) => (index === colorIndex ? replacedColorIndex : index));
  return [replacedColorIndex, ...recentColorIndexes.slice(0, -1)];
}
