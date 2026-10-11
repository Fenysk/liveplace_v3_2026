// Les cases des autres joueurs en fondu décalé : l'état que le jeu et la vue OBS partagent. Le dessin est dans render-scene.ts,
// la règle du décalage, du plafond et des couleurs d'une case en fondu dans arrival.ts.

import { type CellKey, toCellKey } from "@liveplace/domain";
import type { ArrivedPixel } from "../../state/canvas-store";
import { easingCurve, motionEasing, motionMs } from "../design/motion";
import {
  type ArrivalClock,
  arrivalDelay,
  arrivalProgress,
  type ColorLayer,
  isArrivalDone,
  MAX_ARRIVALS,
  shownLayers,
} from "./arrival";
import type { ArrivingCell } from "./render-scene";

export type ArrivalFades = {
  // Un lot qui arrive : ses cases en fondu l'une après l'autre. D'un coup (sans fondu, celles qu'il touchait en cours
  // s'arrêtent) quand `isFading` est faux, en mouvement réduit, ou s'il ne tient pas dans la place restante : jamais à moitié.
  start(lot: readonly ArrivedPixel[], isFading: boolean): void;
  // Les cases en fondu à l'instant `now`. Celles qui ont fini, que le canvas a quittées, ou que l'image ne montre plus à leur
  // couleur (une modération, une pose de soi) s'en vont : l'image dit la vérité.
  advance(
    now: number,
    size: { width: number; height: number },
    colorIndexAt: (x: number, y: number) => number,
  ): ArrivingCell[];
  isRunning(): boolean; // une image de plus est attendue
};

// Une case posée par un autre joueur : son fondu de `base` (ce qu'elle montrait) vers `colorIndex`, sur `--lp-dur-arrival`
// et `--lp-ease`, après son tour dans le lot.
type ArrivalRun = ArrivalClock & {
  x: number;
  y: number;
  base: readonly ColorLayer[];
  colorIndex: number;
};

export function createArrivalFades(root: Element): ArrivalFades {
  const runs = new Map<CellKey, ArrivalRun>();
  let lastFrameAt = 0; // un fondu qu'une réécriture interrompt repart de ce qu'il montrait à la dernière image

  const fade = (lot: readonly ArrivedPixel[], duration: number) => {
    const ease = easingCurve(motionEasing(root));
    lot.forEach(({ x, y, colorIndex, previousColorIndex }, index) => {
      const running = runs.get(toCellKey(x, y));
      const base = running
        ? shownLayers(running.base, running.colorIndex, arrivalProgress(running, lastFrameAt))
        : [{ colorIndex: previousColorIndex, alpha: 1 }];
      runs.set(toCellKey(x, y), {
        x,
        y,
        base,
        colorIndex,
        delay: arrivalDelay(index, lot.length),
        duration,
        ease,
        startedAt: null,
      });
    });
  };

  return {
    start(lot, isFading) {
      const duration = motionMs(root, "--lp-dur-arrival");
      const fresh = lot.filter(({ x, y }) => !runs.has(toCellKey(x, y))).length;
      if (isFading && duration > 0 && runs.size + fresh <= MAX_ARRIVALS) fade(lot, duration);
      else for (const { x, y } of lot) runs.delete(toCellKey(x, y));
    },
    advance(now, size, colorIndexAt) {
      const cells: ArrivingCell[] = [];
      for (const [key, run] of runs) {
        run.startedAt ??= now;
        const isGone =
          run.x >= size.width || run.y >= size.height || colorIndexAt(run.x, run.y) !== run.colorIndex;
        if (isGone || isArrivalDone(run, now)) runs.delete(key);
        else {
          const { x, y, base, colorIndex } = run;
          cells.push({ x, y, base, colorIndex, progress: arrivalProgress(run, now) });
        }
      }
      lastFrameAt = now;
      return cells;
    },
    isRunning: () => runs.size > 0,
  };
}
