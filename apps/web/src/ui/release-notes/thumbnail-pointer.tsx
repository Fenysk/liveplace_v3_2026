// La souris des vignettes : la flèche du système, dessinée en SVG, que le CSS pose à (ax, ay) unités de la vignette plus (bx, by) unités de
// la pill (release-notes.css). L'animation lui donne ses valeurs par des variables ; sans mouvement, elle est cachée (image fixe).

import { MousePointer2, Pipette } from "lucide-react";
import type { PointerMoment } from "./pointer-motion";
import { setThumbnailVariable } from "./thumbnail-variables";

export const Pointer = () => <MousePointer2 className="lp-release-pointer" aria-hidden="true" />;

// Le doigt d'un téléphone : un point à la place de la souris (mêmes variables, la pointe est son centre). Caché sans mouvement.
export const Touch = () => <span className="lp-release-touch" aria-hidden="true" />;

// La souris sur la fresque, pipette armée : l'icône du bouton, comme le curseur du jeu (canvas-cursor.ts). `--lp-release-tool` (0 ou 1) la montre.
export const PipettePointer = () => (
  <Pipette className="lp-release-pointer lp-release-pointer--tool" aria-hidden="true" />
);

// `press` : de 0 à 1, la souris qui s'enfonce au clic.
export const setPointer = (host: HTMLElement, pointer: PointerMoment, press: number): void => {
  setThumbnailVariable(host, "--lp-release-pointer", pointer.opacity);
  setThumbnailVariable(host, "--lp-release-pointer-press", press);
  setThumbnailVariable(host, "--lp-release-ax", pointer.ax);
  setThumbnailVariable(host, "--lp-release-ay", pointer.ay);
  setThumbnailVariable(host, "--lp-release-bx", pointer.bx);
  setThumbnailVariable(host, "--lp-release-by", pointer.by);
};

// L'appui d'un bouton : `[data-tap="nom"]`, de 0 (relevé) à 1 (enfoncé). Le CSS l'enfonce et l'éclaire (release-notes.css).
export const setTaps = (host: HTMLElement, taps: Readonly<Record<string, number>>): void => {
  for (const [name, value] of Object.entries(taps)) {
    const button = host.querySelector<HTMLElement>(`[data-tap="${name}"]`);
    if (button) setThumbnailVariable(button, "--lp-release-tap", value);
  }
};

// Une partie du dessin SVG : son opacité, par l'attribut (le HTML du serveur écrit celle de l'image fixe).
export const setPartOpacity = (host: Element, part: string, opacity: number): void => {
  host.querySelector(`[data-part="${part}"]`)?.setAttribute("opacity", String(opacity));
};
