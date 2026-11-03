// « Le format de la fresque » : le cadre d'une fresque (un petit cœur dedans) au-dessus du sélecteur de format de la fenêtre Fresque
// (le `Segmented` du jeu, ses cinq options, en petit). Une souris choisit 1:1, puis 16:9, puis 9:16 : le cadre prend chaque forme
// (format-motion.ts). L'image fixe : 16:9 choisi, sans la souris.

import { CANVAS_FORMATS } from "@liveplace/domain";
import { useRef } from "react";
import { classNames } from "../design/class-names";
import { FORMAT_RESTING_MS, FRAME_CENTER, type FrameSize, formatAt } from "./format-motion";
import { motifCells } from "./pixel-motifs";
import { layersOfCells } from "./thumbnail-art";
import { Layers, VIEW_BOX } from "./thumbnail-layers";
import { Pointer, setPointer, setTaps } from "./thumbnail-pointer";
import { useVisibleLoop } from "./use-visible-loop";

const SHADOW_OFFSET = { x: 1, y: 2 } as const;
// Le motif du cadre : un petit cœur de 5 cases (15 unités), au centre.
const HEART_LAYERS = layersOfCells(motifCells("heart", 0, 0));
const HEART_SIDE_UNITS = 15;

// Le rectangle d'un cadre centré sur FRAME_CENTER, décalé de `offset` (son ombre).
const frameRect = ({ width, height }: FrameSize, offset = { x: 0, y: 0 }) => ({
  x: FRAME_CENTER.x - width / 2 + offset.x,
  y: FRAME_CENTER.y - height / 2 + offset.y,
  width,
  height,
});

const setRect = (host: Element, part: string, rect: ReturnType<typeof frameRect>): void => {
  const element = host.querySelector(`[data-part="${part}"]`);
  for (const [name, value] of Object.entries(rect)) element?.setAttribute(name, String(value));
};

// Chaque image : le cadre et son ombre, l'option choisie du sélecteur, l'appui de chaque option, la souris.
const renderFormat = (host: HTMLElement, timeMs: number): void => {
  const moment = formatAt(timeMs);
  setRect(host, "shadow", frameRect(moment.frame, SHADOW_OFFSET));
  setRect(host, "canvas", frameRect(moment.frame));
  host.querySelectorAll<HTMLElement>(".lp-segmented-option").forEach((option) => {
    option.classList.toggle("is-selected", option.dataset.tap === moment.chosen);
  });
  setTaps(host, moment.taps);
  setPointer(host, moment.pointer, moment.press);
};

export const FormatThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderFormat, FORMAT_RESTING_MS);
  const resting = formatAt(FORMAT_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-format">
      <svg className="lp-release-svg" viewBox={VIEW_BOX} shapeRendering="crispEdges" aria-hidden="true">
        <rect className="lp-release-shadow" data-part="shadow" {...frameRect(resting.frame, SHADOW_OFFSET)} />
        <rect className="lp-release-paper" data-part="canvas" {...frameRect(resting.frame)} />
        <g
          transform={`translate(${FRAME_CENTER.x - HEART_SIDE_UNITS / 2} ${FRAME_CENTER.y - HEART_SIDE_UNITS / 2}) scale(3)`}
        >
          <Layers layers={HEART_LAYERS} />
        </g>
      </svg>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <span className="lp-segmented lp-selection">
            {CANVAS_FORMATS.map(({ format }) => (
              <span
                key={format}
                className={classNames(
                  "lp-segmented-option lp-type-body",
                  format === resting.chosen && "is-selected",
                )}
                data-tap={format}
                aria-hidden="true"
              >
                {format}
              </span>
            ))}
          </span>
        </span>
      </span>
      <Pointer />
    </span>
  );
};
