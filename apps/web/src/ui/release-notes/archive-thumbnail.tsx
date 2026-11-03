// « Archive et recommence » : une pile de trois mini-fresques parmi six, chacune avec ses propres pixel arts. En boucle, la pile recule :
// celle de devant passe au milieu, celle du milieu derrière, celle de derrière s'en va en fondu, et une neuve entre devant en fondu
// (thumbnail-motion.ts). Hors mouvement, la pile telle quelle.

import { useRef } from "react";
import { ARCHIVE_COMPOSITIONS, ARCHIVE_HEIGHT, ARCHIVE_WIDTH, placementsCells } from "./pixel-motifs";
import { layersOfCells } from "./thumbnail-art";
import { Layers, VIEW_BOX } from "./thumbnail-layers";
import { ARCHIVE_RESTING_MS, archiveAt } from "./thumbnail-motion";
import { useVisibleLoop } from "./use-visible-loop";

const ART_SCALE = 3;
const DRAWINGS = ARCHIVE_COMPOSITIONS.map((placements) => layersOfCells(placementsCells(placements)));

// Une mini-fresque se déplace par `transform` et `opacity` ; l'ordre des couches se refait à chaque étape, quand celle qui part
// derrière est déjà invisible.
const renderArchive = (svg: SVGSVGElement, timeMs: number): void => {
  const { canvases, order } = archiveAt(timeMs);
  for (const layer of svg.querySelectorAll<SVGGElement>("[data-canvas]")) {
    const canvas = canvases[Number(layer.dataset.canvas)];
    if (!canvas) continue;
    layer.setAttribute("transform", `translate(${canvas.x} ${canvas.y})`);
    layer.setAttribute("opacity", String(canvas.opacity));
  }
  const signature = order.join("");
  if (svg.dataset.order === signature) return;
  svg.dataset.order = signature;
  for (const canvas of order) {
    const layer = svg.querySelector(`[data-canvas="${canvas}"]`);
    if (layer) svg.append(layer);
  }
};

export const ArchivesThumbnail = () => {
  const svg = useRef<SVGSVGElement>(null);
  useVisibleLoop(svg, renderArchive, ARCHIVE_RESTING_MS);
  const { canvases, order } = archiveAt(ARCHIVE_RESTING_MS);
  return (
    <svg
      ref={svg}
      className="lp-release-svg"
      viewBox={VIEW_BOX}
      shapeRendering="crispEdges"
      aria-hidden="true"
      data-order={order.join("")}
    >
      {order.map((canvas) => {
        const { x, y, opacity } = canvases[canvas] ?? { x: 0, y: 0, opacity: 0 };
        return (
          <g key={canvas} data-canvas={canvas} opacity={opacity} transform={`translate(${x} ${y})`}>
            <rect
              className="lp-release-shadow"
              x={1}
              y={2}
              width={ARCHIVE_WIDTH * ART_SCALE}
              height={ARCHIVE_HEIGHT * ART_SCALE}
            />
            <rect
              className="lp-release-paper"
              width={ARCHIVE_WIDTH * ART_SCALE}
              height={ARCHIVE_HEIGHT * ART_SCALE}
            />
            <g transform={`scale(${ART_SCALE})`}>
              <Layers layers={DRAWINGS[canvas] ?? []} />
            </g>
          </g>
        );
      })}
    </svg>
  );
};
