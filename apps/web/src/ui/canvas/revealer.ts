// L'apparition d'une fresque en mosaïque : l'état que le jeu et la vue OBS partagent. Le dessin est dans render-scene.ts.
// La fresque paraît la première fois que son image est là. Mouvement réduit : `--lp-dur-reveal` vaut 0, elle paraît d'un coup.
// Les cases arrivées pendant l'apparition ne sont pas perdues : la dernière étape est l'image du moment.

import { easingCurve, motionEasing, motionMs } from "../design/motion";
import { toLevelCanvases } from "./canvas-image";
import { mosaicLevels, REVEAL_STEPS } from "./mosaic";
import type { Ghost, Reveal } from "./render-scene";

// Ce que l'apparition lit de l'image : `isLoaded` dit qu'elle est celle du serveur, plus un décor vide.
export type RevealSource = {
  isLoaded: boolean;
  pixels: Uint8Array;
  palette: readonly string[];
  width: number;
  height: number;
};

export type Revealer = {
  // L'étape de l'apparition à l'instant `now` : nulle avant l'image, après la dernière étape, et en mouvement réduit.
  advance(now: number, source: RevealSource): Reveal | null;
  isRunning(): boolean; // une image de plus est attendue
  isSettled(): boolean; // la fresque a paru : les cases qui arrivent peuvent se mettre en fondu
};

// L'apparition en mosaïque, sur `--lp-dur-reveal` partagée en REVEAL_STEPS étapes égales, chacune sur `--lp-ease`.
type RevealRun = {
  levels: HTMLCanvasElement[];
  stepMs: number;
  ease: (progress: number) => number;
  startedAt: number | null;
};

export function createRevealer(root: Element): Revealer {
  let hasRevealed = false;
  let run: RevealRun | null = null;
  return {
    advance(now, source) {
      if (!hasRevealed && source.isLoaded) {
        hasRevealed = true;
        const duration = motionMs(root, "--lp-dur-reveal");
        if (duration > 0)
          run = {
            levels: toLevelCanvases(mosaicLevels(source.pixels, source.palette, source)),
            stepMs: duration / REVEAL_STEPS,
            ease: easingCurve(motionEasing(root)),
            startedAt: null,
          };
      }
      if (!run) return null;
      run.startedAt ??= now;
      const elapsed = now - run.startedAt;
      if (elapsed >= run.stepMs * REVEAL_STEPS) {
        run = null;
        return null;
      }
      const step = Math.floor(elapsed / run.stepMs);
      return {
        levels: run.levels,
        step,
        progress: run.ease((elapsed - step * run.stepMs) / run.stepMs),
      };
    },
    isRunning: () => run !== null,
    isSettled: () => hasRevealed && run === null,
  };
}

// La fresque que la page vient de quitter s'efface pendant la première étape de la nouvelle ; nulle ensuite, et l'appelant
// l'oublie. Sans apparition (mouvement réduit), elle s'en va avec la première image.
export const ghostOver = (source: CanvasImageSource, reveal: Reveal | null): Ghost | null =>
  reveal && reveal.step === 0 ? { source, alpha: 1 - reveal.progress } : null;
