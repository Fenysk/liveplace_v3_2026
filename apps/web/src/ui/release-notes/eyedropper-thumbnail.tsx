// « La pipette » : la pill Dessin réduite à trois pastilles et la pipette, en bas au centre d'une mini-fresque où se tient un champignon.
// Une souris clique la pipette (elle s'arme), devient l'icône de la pipette sur la fresque, clique un pixel rouge du chapeau : la pastille
// rouge est choisie et la pipette se désarme (eyedropper-motion.ts). L'image fixe : la couleur prise, sans la souris.

import { PALETTE } from "@liveplace/domain";
import { Pipette } from "lucide-react";
import { useRef } from "react";
import {
  EYEDROPPER_RESTING_MS,
  eyedropperAt,
  PICK_MUSHROOM_AT,
  PICKED_CELL,
  SWATCH_COLOR_INDEXES,
} from "./eyedropper-motion";
import { MUSHROOM_LAYERS, SCENE_CELL } from "./inspection-scene";
import { MiniCanvas } from "./mini-canvas";
import { PillTool } from "./pill-tool";
import { ArtAt, CellOutline } from "./scene-art";
import { PipettePointer, Pointer, setPartOpacity, setPointer, setTaps } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// Chaque image : le contour du pixel pris, la pastille choisie, la pipette armée ou non, la souris (flèche, ou pipette sur la fresque).
const renderEyedropper = (host: HTMLElement, timeMs: number): void => {
  const moment = eyedropperAt(timeMs);
  setPartOpacity(host, "outline", moment.outline);
  host.querySelectorAll(".lp-release-swatch").forEach((swatch, index) => {
    swatch.setAttribute("data-chosen", String(index === moment.chosen));
  });
  host.dataset.armed = String(moment.isArmed);
  setThumbnailVariable(host, "--lp-release-tool", moment.isTool ? 1 : 0);
  setTaps(host, { tool: moment.toolTap });
  setPointer(host, moment.pointer, moment.press);
};

export const EyedropperThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderEyedropper, EYEDROPPER_RESTING_MS);
  const resting = eyedropperAt(EYEDROPPER_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-eyedropper" data-armed={String(resting.isArmed)}>
      <MiniCanvas layers={[]}>
        <ArtAt layers={MUSHROOM_LAYERS} x={PICK_MUSHROOM_AT.x} y={PICK_MUSHROOM_AT.y} />
        <g data-part="outline" opacity={resting.outline}>
          <CellOutline
            x={PICK_MUSHROOM_AT.x + PICKED_CELL.x * SCENE_CELL}
            y={PICK_MUSHROOM_AT.y + PICKED_CELL.y * SCENE_CELL}
          />
        </g>
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <span className="lp-release-swatches">
            {SWATCH_COLOR_INDEXES.map((colorIndex, index) => (
              <span
                key={colorIndex}
                className="lp-swatch lp-swatch--recent lp-release-swatch"
                data-chosen={String(index === resting.chosen)}
              >
                <svg className="lp-release-swatch-dot" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx={5} cy={5} r={4.75} fill={PALETTE[colorIndex]} />
                </svg>
              </span>
            ))}
          </span>
          <PillTool icon={Pipette} tap="tool" className="lp-release-tool-eyedropper" />
        </span>
      </span>
      <Pointer />
      <PipettePointer />
    </span>
  );
};
