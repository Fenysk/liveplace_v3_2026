// Écart §9.1 (JOURNAL 2026-10-10) : la photo Twitch d'un streamer, récupérée par le serveur pour l'image d'aperçu de son lien.
// Le CDN de Twitch seul, jamais de redirection, une petite image reconnue ; gardée en mémoire. Sans photo, la carte
// montre l'initiale, comme le design system (Profils).

import { toBase64 } from "@liveplace/shared";
import { createTimedCache } from "../shared/timed-cache";
import { TWITCH_AVATAR_ORIGIN } from "../shared/twitch-avatar-origin";

export const AVATAR_KEPT_MS = 3_600_000; // une photo change rarement : une heure
export const AVATAR_FAILED_RETRY_MS = 300_000; // une photo qui n'a pas chargé laisse cinq minutes au CDN
export const MAX_CACHED_AVATARS = 256;
export const MAX_AVATAR_BYTES = 512 * 1024; // un portrait Twitch en 300 × 300 en pèse quelques dizaines de ko
const AVATAR_TIMEOUT_MS = 3_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type AvatarPhotosDeps = {
  fetchPhoto(url: string, init: RequestInit): Promise<Response>;
  now(): number;
};

export type AvatarPhotos = {
  // Une data URI, `null` si la photo manque ou ne charge pas.
  get(url: string): Promise<string | null>;
};

const isTwitchAvatar = (url: string): boolean => {
  try {
    return new URL(url).origin === TWITCH_AVATAR_ORIGIN;
  } catch {
    return false;
  }
};

export function createAvatarPhotos({ fetchPhoto, now }: AvatarPhotosDeps): AvatarPhotos {
  const cached = createTimedCache<Promise<string | null>>(MAX_CACHED_AVATARS, now);

  // Ne rejette jamais : une photo qui ne charge pas se dit `null`.
  const downloadPhoto = async (url: string): Promise<string | null> => {
    try {
      const response = await fetchPhoto(url, {
        signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
        redirect: "error",
      });
      const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!response.ok || !IMAGE_TYPES.has(type)) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length > MAX_AVATAR_BYTES ? null : `data:${type};base64,${toBase64(bytes)}`;
    } catch (error) {
      console.error(`avatar-photos : ${url} non chargée`, error);
      return null;
    }
  };

  return {
    get(url) {
      if (!isTwitchAvatar(url)) return Promise.resolve(null);
      const kept = cached.get(url);
      if (kept) return kept;
      const photo = downloadPhoto(url);
      cached.set(url, photo, AVATAR_KEPT_MS);
      photo.then((uri) => {
        if (uri === null && cached.get(url) === photo) cached.set(url, photo, AVATAR_FAILED_RETRY_MS);
      });
      return photo;
    },
  };
}
