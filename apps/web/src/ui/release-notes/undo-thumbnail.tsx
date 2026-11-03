// « Annuler, refaire » : la vraie pill Dessin, réduite à ses trois pastilles de couleur et ses trois outils, en bas au centre d'une
// mini-fresque. Une souris trace un champignon en trois traits, clique Annuler deux fois (le pied part, puis les points), puis Refaire
// (les points reviennent). L'image fixe : les trois traits posés, Annuler dégrisé, Refaire grisé, sans la souris.

import { PALETTE } from "@liveplace/domain";
import { MousePointer2, Redo2, Trash, Undo2 } from "lucide-react";
import { useRef } from "react";
import { DRAFT_CELL, DRAFT_ORIGIN, DRAFT_STROKES } from "./draft-strokes";
import { MiniCanvas } from "./mini-canvas";
import { PillTool } from "./pill-tool";
import { UNDO_RESTING_MS, undoAt } from "./thumbnail-motion";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// Le dessin de chaque image : chaque case se montre ou se cache, chaque trait a son opacité, une seule pastille est choisie.
const renderUndo = (host: HTMLElement, timeMs: number): void => {
  const { shown, opacity, armed, canUndo, canRedo, canDiscard, undoTap, redoTap, pointer } = undoAt(timeMs);
  for (const cell of host.querySelectorAll<SVGRectElement>("rect[data-cell]")) {
    const isShown = Number(cell.dataset.cell) < (shown[Number(cell.dataset.stroke)] ?? 0);
    cell.setAttribute("visibility", isShown ? "visible" : "hidden");
  }
  for (const stroke of host.querySelectorAll<SVGGElement>("g[data-stroke]")) {
    stroke.setAttribute("opacity", String(opacity[Number(stroke.dataset.stroke)] ?? 1));
  }
  host.querySelectorAll(".lp-release-swatch").forEach((swatch, index) => {
    swatch.setAttribute("data-chosen", String(index === armed));
  });
  host.dataset.canUndo = String(canUndo);
  host.dataset.canRedo = String(canRedo);
  host.dataset.canDiscard = String(canDiscard);
  setThumbnailVariable(host, "--lp-release-undo-tap", undoTap);
  setThumbnailVariable(host, "--lp-release-redo-tap", redoTap);
  setThumbnailVariable(host, "--lp-release-pointer", pointer.opacity);
  setThumbnailVariable(host, "--lp-release-pointer-press", Math.max(undoTap, redoTap));
  setThumbnailVariable(host, "--lp-release-ax", pointer.ax);
  setThumbnailVariable(host, "--lp-release-ay", pointer.ay);
  setThumbnailVariable(host, "--lp-release-bx", pointer.bx);
  setThumbnailVariable(host, "--lp-release-by", pointer.by);
};

export const UndoThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  useVisibleLoop(host, renderUndo, UNDO_RESTING_MS);
  const resting = undoAt(UNDO_RESTING_MS);
  return (
    <span
      ref={host}
      className="lp-release-scene lp-release-undo"
      data-can-undo={String(resting.canUndo)}
      data-can-redo={String(resting.canRedo)}
      data-can-discard={String(resting.canDiscard)}
    >
      <MiniCanvas layers={[]}>
        <g transform={`translate(${DRAFT_ORIGIN.x} ${DRAFT_ORIGIN.y}) scale(${DRAFT_CELL})`}>
          {/* Les traits se recouvrent dans l'ordre : le chapeau, puis les points par-dessus, puis le pied. */}
          {DRAFT_STROKES.map(({ name, cells }, stroke) => (
            <g key={name} data-stroke={stroke}>
              {cells.map(({ x, y, colorIndex }, cell) => (
                <rect
                  key={`${x}.${y}`}
                  data-stroke={stroke}
                  data-cell={cell}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={PALETTE[colorIndex]}
                />
              ))}
            </g>
          ))}
        </g>
      </MiniCanvas>
      <span className="lp-pill lp-release-pill lp-release-pill--bottom-center">
        <span className="lp-pill-content">
          <span className="lp-release-swatches">
            {DRAFT_STROKES.map(({ name, colorIndex }, stroke) => (
              <span
                key={name}
                className="lp-swatch lp-swatch--recent lp-release-swatch"
                data-chosen={String(stroke === resting.armed)}
              >
                <svg className="lp-release-swatch-dot" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx={5} cy={5} r={4.75} fill={PALETTE[colorIndex]} />
                </svg>
              </span>
            ))}
          </span>
          <PillTool icon={Undo2} className="lp-release-tool-undo" />
          <PillTool icon={Redo2} className="lp-release-tool-redo" />
          <PillTool icon={Trash} className="lp-release-tool-discard" />
        </span>
      </span>
      <MousePointer2 className="lp-release-pointer" aria-hidden="true" />
    </span>
  );
};
