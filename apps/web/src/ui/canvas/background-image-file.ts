// L'image du fond, préparée dans la page avant l'envoi (Écart §9.1, JOURNAL 2026-10-10) : réduite pour que son grand côté fasse
// 2048 px au plus, encodée en WebP, et refusée au-delà de 2 Mo. Le web et Convex ne reçoivent que du WebP déjà borné.

import { BACKGROUND_IMAGE_MAX_BYTES, BACKGROUND_IMAGE_MAX_SIDE } from "@liveplace/domain";
import type { Result } from "@liveplace/shared";

export const BACKGROUND_IMAGE_QUALITY = 0.85;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Size = { width: number; height: number };

// `unreadable` : pas une image que le navigateur sait lire. `unsupported` : il ne sait pas l'encoder en WebP. `too_big` : plus de
// 2 Mo même réduite.
export type PrepareError = "unreadable" | "unsupported" | "too_big";

// Le grand côté ramené à `maxSide`, les proportions gardées ; jamais agrandie, jamais moins d'un pixel d'un côté.
export function fitSide({ width, height }: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Le navigateur, derrière deux appels : lire un fichier, puis dessiner une image à une taille et l'encoder en WebP.
export type DecodedImage = { image: CanvasImageSource; close(): void } & Size;

export type ImageCodec = {
  decode(file: Blob): Promise<DecodedImage>;
  encode(image: CanvasImageSource, size: Size): Promise<Blob | null>;
};

export const browserImageCodec: ImageCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  },
  async encode(image, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", BACKGROUND_IMAGE_QUALITY));
  },
};

export async function prepareBackgroundImage(
  file: Blob,
  codec: ImageCodec = browserImageCodec,
): Promise<Result<Blob, PrepareError>> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: "unreadable" };
  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(file);
  } catch (error) {
    console.error("image du fond : fichier illisible", error);
    return { ok: false, error: "unreadable" };
  }
  try {
    const encoded = await codec.encode(decoded.image, fitSide(decoded, BACKGROUND_IMAGE_MAX_SIDE));
    // Safari n'encode pas en WebP : `toBlob` rend alors un PNG, que le web refuserait.
    if (encoded?.type !== "image/webp") return { ok: false, error: "unsupported" };
    if (encoded.size > BACKGROUND_IMAGE_MAX_BYTES) return { ok: false, error: "too_big" };
    return { ok: true, value: encoded };
  } finally {
    decoded.close();
  }
}
