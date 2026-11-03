// La mini-fresque des vignettes d'une pill : le papier blanc et son ombre, comme la pile de l'archivage, et un pixel art posé dessus.
// Les pills s'y posent à leur vraie place (en haut à droite, en bas au centre) ; ce qui doit bouger dans le dessin va en `children`.

import type { ReactNode } from "react";
import type { ArtLayer } from "./thumbnail-art";
import { Layers, VIEW_BOX } from "./thumbnail-layers";

const ART_SCALE = 2;

export const MiniCanvas = ({ layers, children }: { layers: readonly ArtLayer[]; children?: ReactNode }) => (
  <svg
    className="lp-release-svg lp-release-mini"
    viewBox={VIEW_BOX}
    shapeRendering="crispEdges"
    aria-hidden="true"
  >
    <rect className="lp-release-shadow" x={5} y={6} width={102} height={62} />
    <rect className="lp-release-paper" x={4} y={4} width={102} height={62} />
    <g transform={`scale(${ART_SCALE})`}>
      <Layers layers={layers} />
    </g>
    {children}
  </svg>
);
