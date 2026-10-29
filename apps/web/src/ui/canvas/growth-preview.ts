// L'aperçu de la croissance (Écart §9.3, JOURNAL 2026-10-29) : en Dessin, dans une fresque à taille dynamique, les cases qui vont
// apparaître autour d'elle si on pose ce qu'on vise ou ce qu'on a au brouillon : le damier à demi effacé, et un contour en pointillé
// autour de la fresque telle qu'elle sera. La règle est celle du serveur (`planGrowth` du domaine) ; ici, ce qui la nourrit, et
// l'écriture dans les couches CSS que la scène et `/design` partagent (`GrowthPreview`).

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { type Growth, planGrowth } from "@liveplace/domain/dynamic-size";
import type { Pixel } from "../../state/canvas-store";
import type { Box, Cell, Size } from "./viewport";
import { insetOf } from "./viewport";

// Ce que la scène sait quand elle dessine. `aimedCell` : la case que le pointeur vise, absente au toucher (rien n'y survole) comme
// hors de la fresque ; `colorIndex` : la couleur active, la gomme n'ajoute aucun pixel ; `isPicking` : la pipette ne pose rien.
export type GrowthPreviewInput = {
  isDynamicSize: boolean;
  mode: "view" | "draft";
  draft: readonly Pixel[];
  aimedCell: Cell | null;
  colorIndex: number;
  isPicking: boolean;
  canvas: Size;
};

// De combien la fresque grandirait, ou `null` : rien à montrer (au repos, en Vue, à taille fixe).
export function previewGrowth(input: GrowthPreviewInput): Growth | null {
  if (!input.isDynamicSize || input.mode !== "draft") return null;
  const cells: Cell[] = input.draft.filter(({ colorIndex }) => colorIndex !== TRANSPARENT_COLOR_INDEX);
  const isAimedPlaced = input.colorIndex !== TRANSPARENT_COLOR_INDEX && !input.isPicking;
  if (input.aimedCell && isAimedPlaced) cells.push(input.aimedCell);
  const growth = planGrowth(cells, input.canvas);
  return growth.left + growth.top + growth.right + growth.bottom > 0 ? growth : null;
}

// Les trois pièces que le CSS pose, sans rien savoir du DOM : de quoi les simuler sans navigateur.
export type GrowthPreviewElements = {
  root: { classList: { toggle(name: string, force: boolean): boolean } };
  checker: { style: { setProperty(name: string, value: string): void } };
  outline: { setAttribute(name: string, value: string): void };
};

// Le contour est tracé un cran en dehors de la fresque telle qu'elle sera : sur un côté qui ne grandit pas, il ne se confond pas
// avec la bordure, qui reste dessinée.
const OUTLINE_GAP = 2;

// Montre l'aperçu sur `box` (le rectangle de la fresque agrandie) dans un écran de `screen`, ou le retire (`null`) : le fondu est celui du
// CSS (`--lp-dur-fade`, nul en mouvement réduit). Ne touche au DOM que quand quelque chose change ; retiré, l'aperçu garde sa dernière forme le
// temps de s'effacer.
export function createGrowthPreview({ root, checker, outline }: GrowthPreviewElements) {
  let shown = "";
  return (box: Box | null, screen: Size): void => {
    const next = box ? `${insetOf(box, screen)}|${box.left}|${box.top}|${box.width}|${box.height}` : "";
    if (next === shown) return;
    shown = next;
    if (!box) {
      root.classList.toggle("is-shown", false);
      return;
    }
    checker.style.setProperty("--lp-checker-clip", insetOf(box, screen));
    outline.setAttribute("x", String(box.left - OUTLINE_GAP));
    outline.setAttribute("y", String(box.top - OUTLINE_GAP));
    outline.setAttribute("width", String(box.width + OUTLINE_GAP * 2));
    outline.setAttribute("height", String(box.height + OUTLINE_GAP * 2));
    root.classList.toggle("is-shown", true);
  };
}
