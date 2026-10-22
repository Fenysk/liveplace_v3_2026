// Ce qui bouge par-dessus la scène de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : l'onde du doigt et le vol des pixels.
// Des éléments posés sur une couche au-dessus de tout, animés par WAAPI en pixels concrets, retirés à la fin. Des classes
// donnent leur forme et leur couleur : aucun attribut `style`, que la CSP de production bloque dans le HTML du serveur.

import type { LaunchedPixel } from "./home-demo";
import {
  type Box,
  FLIGHT_EASING,
  FLIGHT_MS,
  flightDelayMs,
  flightKeyframes,
  WAVE_MS,
  waveKeyframes,
} from "./home-flight";
import type { DemoStep } from "./home-script";

// Une fresque de la scène : celle du téléphone, ou celle du stream.
export type GridName = "phone" | "stream";

export type SceneEffects = {
  wave: (target: Element) => void;
  fly: (pixels: readonly LaunchedPixel[], onLanded: (pixel: LaunchedPixel) => void) => void;
  clear: () => void;
};

// La case d'une fresque (pixel-grid.tsx les repère par `data-grid` et `data-cell`).
export const cellElement = (scene: Element, grid: GridName, cell: number): Element | null =>
  scene.querySelector(`[data-grid="${grid}"] [data-cell="${cell}"]`);

// Ce que le doigt de la démo touche : une case, la couleur de son rang dans la rangée, ou le bouton d'envoi.
export const stepTarget = (scene: Element, step: DemoStep): Element | null => {
  if (step.kind === "touch") return cellElement(scene, "phone", step.cell);
  if (step.kind === "pick")
    return scene.querySelectorAll("[data-palette] [role=radio]")[step.colorIndex - 1] ?? null;
  return scene.querySelector("[data-send]");
};

// Le rectangle d'un élément tel qu'il paraît à l'écran, réduction du téléphone comprise, depuis l'angle de la couche.
const boxOf = (element: Element, origin: DOMRect): Box => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
};

export const createSceneEffects = (scene: Element, layer: Element): SceneEffects => {
  const running = new Set<Animation>();

  // `true` quand l'animation va au bout, `false` quand la scène l'annule : seule la première pose un pixel.
  const play = async (
    className: string,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Promise<boolean> => {
    const element = document.createElement("div");
    element.className = className;
    layer.append(element);
    const animation = element.animate(keyframes, options);
    running.add(animation);
    const hasFinished = await animation.finished.then(
      () => true,
      () => false,
    );
    running.delete(animation);
    element.remove();
    return hasFinished;
  };

  const flyPixel = (
    pixel: LaunchedPixel,
    order: number,
    origin: DOMRect,
    onLanded: (pixel: LaunchedPixel) => void,
  ) => {
    const from = cellElement(scene, "phone", pixel.cell);
    const to = cellElement(scene, "stream", pixel.cell);
    if (!from || !to) {
      onLanded(pixel);
      return;
    }
    play(
      `lp-home-fly lp-home-tone-${pixel.colorIndex}`,
      flightKeyframes(boxOf(from, origin), boxOf(to, origin)),
      {
        duration: FLIGHT_MS,
        delay: flightDelayMs(order),
        easing: FLIGHT_EASING,
        fill: "both",
      },
    ).then((hasFinished) => {
      if (hasFinished) onLanded(pixel);
    });
  };

  return {
    wave: (target) => {
      const box = boxOf(target, layer.getBoundingClientRect());
      play("lp-home-wave", waveKeyframes({ x: box.x + box.width / 2, y: box.y + box.height / 2 }), {
        duration: WAVE_MS,
        easing: "ease-out",
      });
    },
    fly: (pixels, onLanded) => {
      const origin = layer.getBoundingClientRect();
      pixels.forEach((pixel, order) => {
        flyPixel(pixel, order, origin, onLanded);
      });
    },
    clear: () => {
      for (const animation of running) animation.cancel();
      running.clear();
      layer.replaceChildren();
    },
  };
};
