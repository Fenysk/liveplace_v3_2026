// Ce que partagent les vignettes dessinées en SVG : la boîte de 112 × 72 et les couches d'un dessin, un tracé par couleur de la palette.

import { PALETTE } from "@liveplace/domain";
import { type ArtLayer, cellsPath } from "./thumbnail-art";

export const SHOT_WIDTH = 112;
export const SHOT_HEIGHT = 72;
export const VIEW_BOX = `0 0 ${SHOT_WIDTH} ${SHOT_HEIGHT}`;

export const Layers = ({ layers }: { layers: readonly ArtLayer[] }) => (
  <>
    {layers.map(({ colorIndex, cells }) => (
      <path key={colorIndex} d={cellsPath(cells)} fill={PALETTE[colorIndex]} />
    ))}
  </>
);
