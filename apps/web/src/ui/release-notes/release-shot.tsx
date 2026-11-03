// La vignette d'une ligne, qui est un bouton : elle s'ouvre en grand au centre de l'écran, avec le titre de la ligne dessous. Un clic sur
// l'image suffit, sans icône : le curseur loupe au survol, l'anneau du survol et celui du focus (release-notes.css) sont ses repères.
// `order` est son rang de lecture dans la liste : il retarde sa boucle (thumbnail-delay.ts), pour la carte comme pour l'agrandissement.

import { useRef, useState } from "react";
import { useTexts } from "../locale/use-locale";
import type { ReleaseThumbnail } from "./release-notes";
import { RELEASE_NOTES_TEXTS } from "./release-notes-texts";
import { THUMBNAILS } from "./release-thumbnails";
import { ThumbnailDelayContext, thumbnailDelayMs } from "./thumbnail-delay";
import { ThumbnailZoom } from "./thumbnail-zoom";

type ReleaseShotProps = { kind: ReleaseThumbnail; title: string; order: number };

export const ReleaseShot = ({ kind, title, order }: ReleaseShotProps) => {
  const t = useTexts(RELEASE_NOTES_TEXTS);
  const [isZoomed, setIsZoomed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const Thumbnail = THUMBNAILS[kind];
  return (
    <ThumbnailDelayContext value={thumbnailDelayMs(order)}>
      <button
        ref={button}
        type="button"
        className="lp-release-shot"
        aria-label={t.enlarge(title)}
        onClick={() => setIsZoomed(true)}
      >
        <Thumbnail />
      </button>
      {isZoomed && (
        <ThumbnailZoom
          title={title}
          onClose={() => {
            setIsZoomed(false);
            button.current?.focus();
          }}
        >
          <Thumbnail />
        </ThumbnailZoom>
      )}
    </ThumbnailDelayContext>
  );
};
