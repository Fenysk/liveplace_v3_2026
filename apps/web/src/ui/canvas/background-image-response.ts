// `/{login}/background` : l'image du fond lue par toutes les pages (GET) et postée par le streamer (POST). Séparée de la route
// pour se tester sans routeur (Écart §9.1, JOURNAL 2026-10-10).

import { BACKGROUND_IMAGE_MAX_BYTES } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import type { BackgroundImages } from "../../usecase/background-images";
import {
  type BackgroundImageDeps,
  type BackgroundImageError,
  setCanvasBackgroundImage,
} from "../../usecase/canvas-background-image";
import { withOwnerSession } from "../../usecase/owner-session";

const A_YEAR_SECONDS = 365 * 24 * 3600;

// L'instant de l'adresse : un entier positif de seize chiffres au plus, rien d'autre ne mène à une lecture de Convex.
const toInstant = (version: string | null): number | null =>
  version !== null && /^\d{1,16}$/.test(version) ? Number(version) : null;

const notFound = (): Response =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export async function backgroundImageResponse(
  images: BackgroundImages,
  login: string,
  version: string | null,
): Promise<Response> {
  const at = toInstant(version);
  if (at === null || at <= 0) return notFound();
  let bytes: Uint8Array | null;
  try {
    bytes = await images.get(login, at);
  } catch (error) {
    console.error("background : image du fond non lue dans Convex", error);
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!bytes) return notFound();
  // L'instant date l'adresse : l'image ne change jamais sous elle.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "image/webp",
      "cache-control": `public, max-age=${A_YEAR_SECONDS}, immutable`,
    },
  });
}

export type UploadDeps = BackgroundImageDeps & { verifier: SessionVerifier };

type UploadError = BackgroundImageError | "unauthenticated" | "bad_request";

// Un `switch` exhaustif : le compilateur signale toute raison laissée sans statut.
const statusOf = (error: UploadError): number => {
  switch (error) {
    case "unauthenticated":
      return 401;
    case "bad_request":
      return 400;
    case "too_big":
      return 413;
    case "invalid_image":
      return 415;
    case "not_active":
      return 409;
    case "failed":
      return 502;
  }
};

const answer = (error?: UploadError): Response =>
  Response.json(error ? { ok: false, error } : { ok: true }, {
    status: error ? statusOf(error) : 200,
    headers: { "cache-control": "no-store" },
  });

// Les octets du corps, jamais plus que la borne : un en-tête qui annonce plus de 2 Mo, ou un corps qui les dépasse sans
// l'annoncer, s'arrête sans tout lire. `null` : trop gros.
async function getBoundedBody(request: Request): Promise<Uint8Array | null> {
  const announced = Number(request.headers.get("content-length"));
  if (announced > BACKGROUND_IMAGE_MAX_BYTES) return null;
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BACKGROUND_IMAGE_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

// Le propriétaire est celui du cookie, jamais un paramètre : sans lui, le corps n'est même pas lu. Le canvas visé est
// `?canvas=` ; Convex vérifie que c'est l'actif de ce propriétaire.
export async function uploadBackgroundImageResponse(
  deps: UploadDeps,
  request: Request,
  cookieHeader: string | undefined,
): Promise<Response> {
  const canvasId = new URL(request.url).searchParams.get("canvas") ?? "";
  const result = await withOwnerSession(
    deps.verifier,
    cookieHeader,
    async (ownerId): Promise<Result<void, BackgroundImageError | "bad_request">> => {
      if (canvasId === "" || canvasId.length > 100) return { ok: false, error: "bad_request" };
      const image = await getBoundedBody(request);
      if (!image) return { ok: false, error: "too_big" };
      return setCanvasBackgroundImage(deps, ownerId, { canvasId, image });
    },
  );
  return answer(result.ok ? undefined : result.error);
}
