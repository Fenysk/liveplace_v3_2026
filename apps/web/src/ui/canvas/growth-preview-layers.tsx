// Les couches de l'aperçu de la croissance (Écart §9.3, JOURNAL 2026-10-29) : le damier, découpé à la fresque agrandie, et son contour en
// pointillé, sous le canvas. La scène du jeu les pilote (canvas-scene.ts), `/design` aussi (growth-preview-demo.tsx) : `isContained` les
// pose dans une boîte au lieu de l'écran. Aucune ne prend un clic.

import type { RefObject } from "react";
import { classNames } from "../design/class-names";

export type GrowthPreviewRefs = {
  root: RefObject<HTMLDivElement | null>;
  checker: RefObject<HTMLDivElement | null>;
  tiles: RefObject<HTMLDivElement | null>;
  outline: RefObject<SVGRectElement | null>;
};

export const GrowthPreview = ({
  refs,
  isContained = false,
}: {
  refs: GrowthPreviewRefs;
  isContained?: boolean;
}) => (
  <div
    ref={refs.root}
    className={classNames("lp-growth-preview", isContained && "lp-growth-preview--contained")}
    aria-hidden="true"
  >
    <div ref={refs.checker} className="lp-checker">
      <div ref={refs.tiles} className="lp-checker-tiles" />
    </div>
    <svg className="lp-growth-preview-outline" aria-hidden="true">
      <rect ref={refs.outline} />
    </svg>
  </div>
);
