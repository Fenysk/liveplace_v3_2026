// La vignette agrandie : un second `<dialog>` modal, donc par-dessus la fenêtre, avec un flou sur tout ce qui est derrière. Échap ne
// ferme que lui (le `cancel` va au dernier dialogue ouvert), un clic à côté ou le bouton Fermer aussi ; le focus revient à la vignette
// (le parent le lui rend à la fermeture).

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { useTexts } from "../locale/use-locale";

type ThumbnailZoomProps = { title: string; onClose: () => void; children: ReactNode };

export const ThumbnailZoom = ({ title, onClose, children }: ThumbnailZoomProps) => {
  const design = useTexts(DESIGN_TEXTS);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // Hors de l'image et de la légende, le clic tombe sur le dialogue lui-même, qui couvre l'écran : le clavier a Échap et Fermer.
    const dismiss = (event: MouseEvent) => {
      if (event.target === element) element.close();
    };
    element.addEventListener("click", dismiss);
    return () => element.removeEventListener("click", dismiss);
  }, []);
  return (
    <dialog
      ref={dialog}
      className="lp-zoom"
      aria-label={title}
      // React fait remonter `close` d'un dialogue ouvert dedans : seul le sien ferme l'agrandissement.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lp-pill lp-zoom-close">
        <div className="lp-pill-content">
          <Button icon={X} variant="ghost" title={design.closeTip} onPress={() => dialog.current?.close()} />
        </div>
      </div>
      <figure className="lp-zoom-figure">
        <div className="lp-release-shot lp-release-shot--zoomed" aria-hidden="true">
          {children}
        </div>
        <figcaption className="lp-pill lp-zoom-caption">
          <span className="lp-pill-content lp-type-title">{title}</span>
        </figcaption>
      </figure>
    </dialog>
  );
};
