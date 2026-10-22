// Une fresque de 12 cases sur 12, celle du téléphone ou celle du stream. La couleur d'une case est une classe
// `lp-home-tone-N` (home.css), jamais un `style` : le HTML du serveur n'en porte aucun (CSP de production).

import { type RefObject, useEffect, useRef } from "react";
import { classNames } from "../design/class-names";
import { GRID_SIDE } from "./home-art";
import type { CellSwatches } from "./home-demo";
import type { GridName } from "./scene-effects";

const CELLS = Array.from({ length: GRID_SIDE * GRID_SIDE }, (_, cell) => cell);

type PixelGridProps = {
  name: GridName;
  cells: CellSwatches;
  draft?: CellSwatches; // les cases du brouillon, par-dessus : plus claires, cerclées
  onTouch?: (cell: number) => void; // sans lui, la fresque ne se touche pas (celle du stream)
  label?: string; // une image pour un lecteur d'écran, comme la fresque du jeu ; sans lui, la fresque est décorative
};

// La case d'un clic, lue sur `data-cell`.
const cellOf = (target: EventTarget | null): number | null => {
  const cell = target instanceof HTMLElement ? target.dataset.cell : undefined;
  return cell === undefined ? null : Number(cell);
};

// Une seule écoute pour les 144 cases, posée comme celle de la fresque du jeu : la fresque est une image, pas un contrôle.
const useCellTouch = (grid: RefObject<HTMLDivElement | null>, onTouch: PixelGridProps["onTouch"]): void => {
  const latest = useRef(onTouch);
  const isTouchable = onTouch !== undefined;
  useEffect(() => {
    latest.current = onTouch;
  });
  useEffect(() => {
    const element = grid.current;
    if (!element || !isTouchable) return;
    const controller = new AbortController();
    element.addEventListener(
      "click",
      (event) => {
        const cell = cellOf(event.target);
        if (cell !== null) latest.current?.(cell);
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [grid, isTouchable]);
};

export const PixelGrid = ({ name, cells, draft, onTouch, label }: PixelGridProps) => {
  const grid = useRef<HTMLDivElement>(null);
  useCellTouch(grid, onTouch);
  return (
    <div
      ref={grid}
      className={classNames("lp-home-grid", `lp-home-grid--${name}`)}
      data-grid={name}
      {...(label ? { role: "img", "aria-label": label } : {})}
    >
      {CELLS.map((cell) => {
        const draftColor = draft?.get(cell);
        const colorIndex = draftColor ?? cells.get(cell);
        return (
          <i
            key={cell}
            data-cell={cell}
            className={classNames(
              "lp-home-cell",
              colorIndex !== undefined && `lp-home-tone-${colorIndex}`,
              draftColor !== undefined && "is-draft",
            )}
          />
        );
      })}
    </div>
  );
};
