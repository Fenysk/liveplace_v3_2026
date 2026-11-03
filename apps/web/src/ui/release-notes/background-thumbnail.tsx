// « Choisis ton fond » : le vrai choix du fond de la section Fresque (SwatchChoice : le damier du transparent, le vrai noir, le vrai
// blanc), en petit, et un seul aperçu : la mini-fresque et son cœur sur le fond choisi. En boucle, la sélection passe à l'option
// suivante et l'aperçu change en fondu. L'image n'est pas une pastille du jeu : c'est un réglage à part, posé par-dessus n'importe
// quel fond à son opacité (40 % par défaut), qui couvre la fresque ; ici un petit paysage en pixels, sur le fond blanc de l'option d'avant.

import { BACKGROUND_IMAGE_OPACITY, PALETTE } from "@liveplace/domain";
import { useRef } from "react";
import { classNames } from "../design/class-names";
import {
  cellsPath,
  checkerCells,
  HEART_CELLS,
  HEART_COLOR_INDEX,
  LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH,
  landscapeLayers,
} from "./thumbnail-art";
import { Layers } from "./thumbnail-layers";
import { BACKGROUND_OPTIONS, BACKGROUND_RESTING_MS, backgroundAt } from "./thumbnail-motion";
import { useVisibleLoop } from "./use-visible-loop";

const COLUMNS = LANDSCAPE_WIDTH;
const ROWS = LANDSCAPE_HEIGHT;
const CELL = 4;
const PREVIEW_WIDTH = COLUMNS * CELL;
const PREVIEW_HEIGHT = ROWS * CELL;
const HEART_LEFT = 26; // le cœur, centré dans l'aperçu
const LANDSCAPE = landscapeLayers();
const CHECKER_PATH = cellsPath(checkerCells(COLUMNS, ROWS));
const HEART_PATH = cellsPath(HEART_CELLS);

// Les pastilles du jeu : une classe de palette.css par teinte. L'image, elle, a la sienne (release-notes.css).
const SWATCH_CLASS = {
  transparent: "is-transparent",
  black: "lp-swatch--png-black",
  white: "lp-swatch--png-white",
  image: "lp-release-swatch--image",
} as const satisfies Record<(typeof BACKGROUND_OPTIONS)[number], string>;

const setOpacity = (element: Element | null, opacity: number): void => {
  element?.setAttribute("opacity", String(opacity));
};

// Chaque image : le poids du fond noir, du fond blanc et de l'image, et la pastille que la sélection entoure.
const renderBackground = (demo: HTMLElement, timeMs: number): void => {
  const { chosen, black, white, image } = backgroundAt(timeMs);
  setOpacity(demo.querySelector('[data-layer="black"]'), black);
  setOpacity(demo.querySelector('[data-layer="white"]'), white);
  setOpacity(demo.querySelector('[data-layer="image"]'), (image * BACKGROUND_IMAGE_OPACITY) / 100);
  for (const swatch of demo.querySelectorAll<HTMLElement>("[data-option]"))
    swatch.classList.toggle("lp-release-swatch--on", Number(swatch.dataset.option) === chosen);
};

export const BackgroundsThumbnail = () => {
  const demo = useRef<HTMLSpanElement>(null);
  useVisibleLoop(demo, renderBackground, BACKGROUND_RESTING_MS);
  const { chosen, black, white, image } = backgroundAt(BACKGROUND_RESTING_MS);
  return (
    <span ref={demo} className="lp-release-bg" aria-hidden="true">
      <svg
        className="lp-release-bg-preview"
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect className="lp-release-shadow" x={1} y={2} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />
        <rect className="lp-release-paper" width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />
        <path className="lp-release-checker" d={CHECKER_PATH} transform={`scale(${CELL})`} />
        <rect
          className="lp-release-background--black"
          data-layer="black"
          opacity={black}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
        />
        <rect
          className="lp-release-background--white"
          data-layer="white"
          opacity={white}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
        />
        <g data-layer="image" opacity={(image * BACKGROUND_IMAGE_OPACITY) / 100}>
          <g transform={`scale(${CELL})`}>
            <Layers layers={LANDSCAPE} />
          </g>
        </g>
        <path
          d={HEART_PATH}
          fill={PALETTE[HEART_COLOR_INDEX]}
          transform={`translate(${HEART_LEFT} 0) scale(${CELL})`}
        />
      </svg>
      <span className="lp-release-swatches">
        {BACKGROUND_OPTIONS.map((option, index) => (
          <span
            key={option}
            className={classNames(
              "lp-swatch",
              SWATCH_CLASS[option],
              index === chosen && "lp-release-swatch--on",
            )}
            data-option={index}
          >
            {option === "image" && (
              <svg
                className="lp-release-swatch-picture"
                viewBox={`0 0 ${COLUMNS} ${ROWS}`}
                preserveAspectRatio="xMaxYMid slice"
                shapeRendering="crispEdges"
                aria-hidden="true"
              >
                <Layers layers={LANDSCAPE} />
              </svg>
            )}
          </span>
        ))}
      </span>
    </span>
  );
};
