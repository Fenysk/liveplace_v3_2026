// Les marges du cadrage d'arrivée sur mobile (Écart §9.3, JOURNAL 2026-10-08) : le canvas se cadre dans la zone libre entre
// le bas de l'en-tête (la rangée des pills Canvas et Compte, puis la bande Thème quand elle est là) et le haut de la barre
// du bas. Lues dans la page à chaque appel, jamais gardées : elles suivent le thème, l'encoche et l'écran.

import type { PillDock } from "../design/pill";
import { THEME_BAR_HEIGHT } from "../design/top-bar";
import { COMPACT_SCREEN_QUERY } from "../design/use-media-query";
import { type Insets, NO_INSETS } from "./viewport";

const px = (value: string): number => Number.parseFloat(value) || 0;

const dockOf = (root: HTMLElement, dock: PillDock): HTMLElement | null =>
  root.querySelector<HTMLElement>(`.lp-floating[data-dock="${dock}"]`);

// Au PC, les pills flottent sur le canvas : aucune marge.
export function measureArrivalInsets(root: HTMLElement): Insets {
  if (!window.matchMedia(COMPACT_SCREEN_QUERY).matches) return NO_INSETS;
  const style = getComputedStyle(root);
  const rowBottoms = (["tl", "tr"] as const).flatMap((dock) => {
    const element = dockOf(root, dock);
    return element ? [element.getBoundingClientRect().bottom] : [];
  });
  // La bande à sa place de Vue, jamais celle qu'elle prend en Dessin (elle y monte par `transform`, pas par `top`) :
  // entrer en Dessin ne déplace pas le canvas. Sa hauteur est celle que la pill publie (pill.tsx), absente sans thème.
  const band = dockOf(root, "tc");
  const bandHeight = Math.max(0, px(style.getPropertyValue(THEME_BAR_HEIGHT)));
  const bandBottom = band && bandHeight > 0 ? px(getComputedStyle(band).top) + bandHeight : 0;
  // La barre du bas d'une ligne de contrôles, quoi qu'elle montre : la feuille Dessin ne déplace pas le canvas non plus.
  const bar = dockOf(root, "bc");
  const barHeight =
    px(style.getPropertyValue("--control-size")) + 2 * px(style.getPropertyValue("--space-2"));
  return {
    top: Math.max(0, ...rowBottoms, bandBottom),
    right: 0,
    bottom: bar ? px(getComputedStyle(bar).bottom) + barHeight : 0,
    left: 0,
  };
}
