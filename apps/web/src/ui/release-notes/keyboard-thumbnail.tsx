// « Dessiner au clavier » : une mini-fresque et, en bas au centre, les touches du clavier (quatre flèches et Espace, la classe `lp-kbd` du
// jeu). Les flèches s'allument une à une et la case visée saute de case en case ; Espace la remplit : quatre pixels forment un sourire
// (keyboard-motion.ts). Pas de souris. L'image fixe : le sourire dessiné et la case visée à côté du dernier pixel, touches éteintes.

import { PALETTE } from "@liveplace/domain";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon, Space } from "lucide-react";
import { useRef } from "react";
import { MUSHROOM_LAYERS } from "./inspection-scene";
import {
  KEYBOARD_RESTING_MS,
  type KeyName,
  keyboardAt,
  PIXEL_CELLS,
  type TargetCell,
} from "./keyboard-motion";
import { MiniCanvas } from "./mini-canvas";
import { ArtAt, CELL, CellOutline } from "./scene-art";
import { setPartOpacity, setTaps } from "./thumbnail-pointer";
import { useVisibleLoop } from "./use-visible-loop";

// Où le champignon se pose, et le coin haut gauche du sourire (la case 0, 0 de keyboard-motion.ts), en unités de la vignette.
const MUSHROOM_AT = { x: 10, y: 10 } as const;
const SMILE_AT = { x: 58, y: 17 } as const;
const SMILE_COLOR_INDEX = 28;

const KEYS = [
  { name: "up", icon: ArrowUp },
  { name: "left", icon: ArrowLeft },
  { name: "down", icon: ArrowDown },
  { name: "right", icon: ArrowRight },
  { name: "space", icon: Space },
] as const satisfies readonly { name: KeyName; icon: LucideIcon }[];

const targetTransform = ({ x, y }: TargetCell): string => `translate(${x * CELL} ${y * CELL})`;

// Chaque image : la case visée et son contour, les pixels, l'appui de chaque touche.
const renderKeyboard = (host: HTMLElement, timeMs: number): void => {
  const moment = keyboardAt(timeMs);
  setPartOpacity(host, "outline", moment.outline);
  for (const [index, opacity] of moment.pixels.entries()) setPartOpacity(host, `pixel-${index}`, opacity);
  host.querySelector('[data-part="target"]')?.setAttribute("transform", targetTransform(moment.target));
  setTaps(host, moment.pressed);
};

export const KeyboardThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderKeyboard, KEYBOARD_RESTING_MS);
  const resting = keyboardAt(KEYBOARD_RESTING_MS);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-keyboard">
      <MiniCanvas layers={[]}>
        <ArtAt layers={MUSHROOM_LAYERS} x={MUSHROOM_AT.x} y={MUSHROOM_AT.y} />
        {PIXEL_CELLS.map(({ x, y }, index) => (
          <rect
            key={`${x},${y}`}
            data-part={`pixel-${index}`}
            x={SMILE_AT.x + x * CELL}
            y={SMILE_AT.y + y * CELL}
            width={CELL}
            height={CELL}
            fill={PALETTE[SMILE_COLOR_INDEX]}
            opacity={resting.pixels[index]}
          />
        ))}
        <g data-part="outline" opacity={resting.outline}>
          <g data-part="target" transform={targetTransform(resting.target)}>
            <CellOutline x={SMILE_AT.x} y={SMILE_AT.y} />
          </g>
        </g>
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <span className="lp-release-keys">
            {KEYS.map(({ name, icon: Icon }) => (
              <span
                key={name}
                className={`lp-kbd lp-release-key lp-release-key--${name}`}
                data-tap={name}
                aria-hidden="true"
              >
                <Icon className="lp-release-key-icon" />
              </span>
            ))}
          </span>
        </span>
      </span>
    </span>
  );
};
