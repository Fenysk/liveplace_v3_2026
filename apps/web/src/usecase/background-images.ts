// `GET /{login}/background` : l'image du fond du canvas actif d'un login. Un fichier de Convex lu une fois par login et par
// instant, gardé en mémoire : l'instant date l'image, donc une valeur gardée ne devient jamais fausse, elle devient ancienne.

import type { Timestamp } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { createTimedCache } from "../shared/timed-cache";

export const BACKGROUND_IMAGE_KEPT_MS = 5 * 60_000;
export const MAX_CACHED_BACKGROUND_IMAGES = 16; // 2 Mo au plus chacune

export type BackgroundImagesDeps = {
  durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasBackgroundImage">;
  now(): Timestamp;
};

export type BackgroundImages = {
  // `null` : le login est inconnu, ou son canvas actif n'a plus d'image de cet instant.
  get(login: string, at: Timestamp): Promise<Uint8Array | null>;
};

type Image = Promise<Uint8Array | null>;

export function createBackgroundImages({ durable, now }: BackgroundImagesDeps): BackgroundImages {
  const cached = createTimedCache<Image>(MAX_CACHED_BACKGROUND_IMAGES, now);

  const read = async (login: string, at: Timestamp): Image => {
    const owner = await durable.getUserByLogin(login);
    return owner ? durable.getActiveCanvasBackgroundImage(owner.userId, at) : null;
  };

  return {
    get(login, at) {
      const key = `${login.toLowerCase()}:${at}`;
      const kept = cached.get(key);
      if (kept) return kept;
      const image = read(login.toLowerCase(), at);
      cached.set(key, image, BACKGROUND_IMAGE_KEPT_MS);
      // Ni un refus ni une panne ne se gardent : l'image qui arrive est servie à la demande suivante.
      const forget = (): void => {
        if (cached.get(key) === image) cached.delete(key);
      };
      image.then((bytes) => bytes ?? forget(), forget);
      return image;
    },
  };
}
