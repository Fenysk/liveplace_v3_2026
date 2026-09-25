// La fenêtre du banni (JOURNAL 2026-09-25) : au milieu de l'écran, il est banni et ne peut plus que regarder, avec la
// preuve, ses pixels seuls sur le canvas. L'affichage seul, nourri par `useBannedWindowProps`.

import type { Pixel } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { SmallWindow } from "../design/window";
import { pixelCountLabel } from "./moderation-texts";
import type { CanvasPreviewProps } from "./moderation-window";

export type BannedWindowProps = {
  isOpen: boolean;
  pixels: readonly Pixel[] | null; // sa preuve ; `null` tant qu'elle se charge
  canvas: CanvasPreviewProps;
  onClose: () => void; // Je comprends, Échap ou Fermer
};

export const BannedWindow = ({ isOpen, pixels, canvas, onClose }: BannedWindowProps) => (
  <SmallWindow
    isOpen={isOpen}
    title="Tu es banni·e de ce canvas"
    onClose={onClose}
    actions={<Button label="Je comprends" variant="primary" onPress={onClose} />}
  >
    {pixels && pixels.length > 0 && (
      <>
        <p className="lp-type-body lp-prompt">Les pixels qui t'ont valu ce bannissement ont été retirés :</p>
        <PixelPreview {...canvas} pixels={pixels} label="Tes pixels retirés" />
        <span className="lp-type-caption lp-muted lp-prompt">{pixelCountLabel(pixels.length)}</span>
      </>
    )}
    <p className="lp-type-body lp-prompt">Tu peux seulement regarder le canvas.</p>
  </SmallWindow>
);
