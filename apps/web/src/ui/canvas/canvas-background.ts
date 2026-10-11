// Le fond de la fresque (Écart §9.1, JOURNAL 2026-10-10), peint sous les pixels : le même pinceau en jeu et dans la vue OBS.
// Un fond noir ou blanc remplit le cadre. L'image se pose par-dessus n'importe quel fond, transparent compris, à son opacité : elle
// couvre le cadre comme `object-fit: cover`, lissée à sa propre résolution (jamais ramenée à la grille des cases).

import type { ObsBackground } from "@liveplace/domain";
import { obsFillStyle } from "../obs/obs-background";

export type Rect = { left: number; top: number; width: number; height: number };
type Size = { width: number; height: number };

// L'image chargée, et sa taille propre.
export type BackdropPicture = { source: CanvasImageSource } & Size;

// `fill` : la couleur pleine du fond, `null` pour Transparent. `opacity` : celle de l'image, en pourcents.
export type Backdrop = {
  fill: string | null;
  image: { source: CanvasImageSource; size: Size; opacity: number } | null;
};

// Le rectangle de l'image qui remplit `frame` sans se déformer : centré, rogné là où les proportions diffèrent.
export function coverSource(image: Size, frame: Size): Rect {
  const scale = Math.max(frame.width / image.width, frame.height / image.height);
  const [width, height] = [frame.width / scale, frame.height / scale];
  return { left: (image.width - width) / 2, top: (image.height - height) / 2, width, height };
}

// `getProperty` lit une propriété CSS du document (le vrai noir et le vrai blanc). Une image qui n'est pas chargée, ou à 0 %, ne
// peint rien.
export function toBackdrop(
  background: ObsBackground,
  picture: BackdropPicture | null,
  opacity: number,
  getProperty: (property: string) => string,
): Backdrop {
  return {
    fill: background === "transparent" ? null : obsFillStyle(background, getProperty),
    image:
      picture && opacity > 0
        ? { source: picture.source, size: { width: picture.width, height: picture.height }, opacity }
        : null,
  };
}

// Le fond plein d'abord, puis l'image par-dessus à son opacité : plus elle est basse, plus le fond se voit à travers, et sans
// fond, le damier du jeu ou la source d'OBS.
export function renderBackdrop(
  context: CanvasRenderingContext2D,
  rect: Rect,
  { fill, image }: Backdrop,
): void {
  if (fill !== null) {
    context.fillStyle = fill;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  if (!image) return;
  const crop = coverSource(image.size, rect);
  context.save();
  context.globalAlpha = image.opacity / 100;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image.source,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  );
  context.restore();
}

// Les jetons du vrai noir et du vrai blanc (tokens.css) sont les mêmes dans les deux apparences : lus une fois sur l'élément, pas à
// chaque image.
export function createPropertyReader(element: Element): (property: string) => string {
  const known = new Map<string, string>();
  return (property) => {
    const value = known.get(property) ?? getComputedStyle(element).getPropertyValue(property).trim();
    known.set(property, value);
    return value;
  };
}

export type BackdropImage = {
  set(url: string | null): void; // sans adresse, l'image part aussitôt ; une autre adresse garde l'ancienne jusqu'à son chargement
  get(): BackdropPicture | null;
  dispose(): void;
};

// `onReady` : une image vient d'être chargée, la scène se repeint. `makeImage` : un `<img>`, injecté pour se tester sans navigateur.
export function createBackdropImage(
  onReady: () => void,
  makeImage: () => HTMLImageElement = () => new Image(),
): BackdropImage {
  let url: string | null = null;
  let shown: HTMLImageElement | null = null;
  let isDisposed = false;

  return {
    set(next) {
      if (next === url) return;
      url = next;
      if (next === null) {
        shown = null;
        return;
      }
      const image = makeImage();
      // Une réponse tardive d'une adresse qu'on a quittée ne remplace rien.
      image.onload = () => {
        if (isDisposed || url !== next) return;
        shown = image;
        onReady();
      };
      image.onerror = () => {
        if (url === next) shown = null;
      };
      image.src = next;
    },
    get: () => (shown ? { source: shown, width: shown.naturalWidth, height: shown.naturalHeight } : null),
    dispose() {
      isDisposed = true;
      url = null;
      shown = null;
    },
  };
}
