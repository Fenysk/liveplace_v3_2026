// Les marges du cadrage d'arrivée sur mobile (Écart §9.3, JOURNAL 2026-10-08) : le canvas se cadre dans la zone libre entre
// le bas de l'en-tête (la rangée des pills Canvas et Compte, puis la bande Thème quand elle est là) et ce que la disposition
// laisse en bas et sur les côtés : la barre du bas, la colonne d'un téléphone en paysage, le premier écran d'une charnière
// (canvas-zone.css). Lues dans la page à chaque appel, jamais gardées : elles suivent le thème, l'encoche et l'écran.

import type { PillDock } from "../design/pill";
import { THEME_BAR_HEIGHT } from "../design/top-bar";
import { COMPACT_SCREEN_QUERY, SIDE_COLUMN_QUERY } from "../design/use-media-query";
import { type ArrivalZone, type Insets, NO_INSETS, pickArrivalZone, type Size } from "./viewport";

const px = (value: string): number => Number.parseFloat(value) || 0;

// Deux sondes, deux zones libres en Vue (Écart §9.3, JOURNAL 2026-10-09) : à côté de la colonne (celle que le Dessin garde) et
// au-dessus d'elle ; sans colonne large, la même.
const SIDE_ZONE_SELECTOR = ".lp-canvas-zone:not(.lp-canvas-zone--above)";
const ABOVE_ZONE_SELECTOR = ".lp-canvas-zone--above";
// Sur <html> quand le canvas arrive au-dessus de la colonne : Recentrer et le toast s'y posent (pill-landscape.css).
export const ZONE_ABOVE_ATTRIBUTE = "data-zone-above";

const dockOf = (root: HTMLElement, dock: PillDock): HTMLElement | null =>
  root.querySelector<HTMLElement>(`.lp-floating[data-dock="${dock}"]`);

// Ce que la sonde de zone laisse de chaque côté de l'écran : sa boîte est celle du premier écran, moins les marges du CSS.
function zoneSides(root: HTMLElement, screen: Size, selector: string): Omit<Insets, "top"> {
  const zone = root.querySelector<HTMLElement>(selector);
  if (!zone) return { right: 0, bottom: 0, left: 0 };
  const box = zone.getBoundingClientRect();
  return {
    right: Math.max(0, screen.width - box.right),
    bottom: Math.max(0, screen.height - box.bottom),
    left: Math.max(0, box.left),
  };
}

// Au PC, les pills flottent sur le canvas : aucune marge. Sur un écran tactile large, la plus grande des deux zones (`pickArrivalZone`).
export function measureArrivalInsets(
  root: HTMLElement,
  screen: Size,
  canvas: Size,
): { insets: Insets; zone: ArrivalZone } {
  if (!window.matchMedia(COMPACT_SCREEN_QUERY).matches) return { insets: NO_INSETS, zone: "side" };
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
  // Le bas et les côtés disent une disposition, pas la hauteur du moment : la feuille Dessin ne déplace pas le canvas non plus.
  const top = Math.max(0, ...rowBottoms, bandBottom);
  const side = { top, ...zoneSides(root, screen, SIDE_ZONE_SELECTOR) };
  const above = { top, ...zoneSides(root, screen, ABOVE_ZONE_SELECTOR) };
  const zone = pickArrivalZone(screen, canvas, side, above);
  return { insets: zone === "above" ? above : side, zone };
}

// La boîte des zones, pour que la scène se recadre quand une charnière ou une posture les change sans changer l'écran.
export function observeZone(root: HTMLElement, onChange: () => void): () => void {
  const observer = new ResizeObserver(onChange);
  for (const zone of root.querySelectorAll<HTMLElement>(".lp-canvas-zone")) observer.observe(zone);
  return () => observer.disconnect();
}

// La zone libre en Dessin, sur mobile, Écart §9.3 (JOURNAL 2026-10-08) : la bande Thème a pris la place de la rangée des pills
// (pill.css), et la feuille Dessin, plus haute que la barre de la Vue, tient le bas. Les mesures sont celles de la mise en
// page finale : la bande monte par `transform` et la feuille se déploie par `animate`, tous deux en cours à l'entrée.
// Les côtés disent la disposition (la sonde de zone à côté de la colonne) ; en colonne sur le côté, le panneau y tient aussi le bas.
export function measureDraftInsets(root: HTMLElement, screen: Size): Insets {
  if (!window.matchMedia(COMPACT_SCREEN_QUERY).matches) return NO_INSETS;
  const rowTops = (["tl", "tr"] as const).flatMap((dock) => {
    const element = dockOf(root, dock);
    return element ? [element.getBoundingClientRect().top] : [];
  });
  const rowTop = rowTops.length > 0 ? Math.min(...rowTops) : 0;
  const bandHeight = Math.max(0, px(getComputedStyle(root).getPropertyValue(THEME_BAR_HEIGHT)));
  const bar = dockOf(root, "bc");
  const sheet = bar?.querySelector<HTMLElement>(".lp-pill-content");
  const sides = zoneSides(root, screen, SIDE_ZONE_SELECTOR);
  const sheetBottom = bar && sheet ? px(getComputedStyle(bar).bottom) + sheet.offsetHeight : 0;
  const isPanel = window.matchMedia(SIDE_COLUMN_QUERY).matches;
  return { top: rowTop + bandHeight, ...sides, bottom: isPanel ? sides.bottom : sheetBottom };
}
