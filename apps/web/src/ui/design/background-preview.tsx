// La vignette de l'image du fond (Écart §9.1, JOURNAL 2026-10-10) : l'image par-dessus le fond choisi, à l'opacité du curseur. Rendue par le
// serveur comme le reste de la fenêtre : la teinte du fond et l'opacité passent par des classes et un attribut, jamais par `style`
// (la CSP de production le bloque).

import type { ObsBackground } from "@liveplace/domain";
import { classNames } from "./class-names";

type BackgroundPreviewProps = {
  imageUrl: string;
  background: ObsBackground; // le fond sous l'image : le damier du transparent, le vrai noir ou le vrai blanc
  opacity: number; // un cran de 0 à 100 : une règle de background-preview.css par cran
  label: string;
};

export const BackgroundPreview = ({ imageUrl, background, opacity, label }: BackgroundPreviewProps) => (
  <div className={classNames("lp-bg-preview", `lp-bg-preview--${background}`)} role="img" aria-label={label}>
    <img className="lp-bg-preview-image" src={imageUrl} alt="" data-opacity={opacity} />
  </div>
);
