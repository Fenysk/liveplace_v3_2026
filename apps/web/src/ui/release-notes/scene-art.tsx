// Ce que les vignettes à mini-fresque dessinent dans leur SVG : un pixel art posé à un endroit (une case = 3 unités, comme l'archivage et
// la fresque qui grandit), et le contour d'une case, noir dehors et blanc dedans comme celui du brouillon et de la case visée du jeu.

import type { ArtLayer } from "./thumbnail-art";
import { Layers } from "./thumbnail-layers";

export const CELL = 3;

type ArtAtProps = { layers: readonly ArtLayer[]; x: number; y: number };

export const ArtAt = ({ layers, x, y }: ArtAtProps) => (
  <g transform={`translate(${x} ${y}) scale(${CELL})`}>
    <Layers layers={layers} />
  </g>
);

// Le contour d'une case de 1 × 1 case (3 × 3 unités) dont le coin haut gauche est à (x, y) unités : un trait noir autour, un blanc dedans.
export const CellOutline = ({ x, y }: { x: number; y: number }) => (
  <>
    <rect
      className="lp-release-outline lp-release-outline--out"
      x={x - 0.5}
      y={y - 0.5}
      width={CELL + 1}
      height={CELL + 1}
    />
    <rect
      className="lp-release-outline lp-release-outline--in"
      x={x + 0.5}
      y={y + 0.5}
      width={CELL - 1}
      height={CELL - 1}
    />
  </>
);
