// `/{login}/preview.png` : l'image du canvas actif d'un login, pour la carte d'aperçu de son lien. Un rendu par canvas et par
// minute au plus, gardé en mémoire : un retard de rendu est voulu, et un robot qui insiste ne coûte rien de plus,
// ni à Redis ni à Convex (qui donne le canvas du login).

import type { Timestamp } from "@liveplace/domain";
import type { ArchiveWrites, CanvasImage, DurableStore } from "@liveplace/domain/ports";
import { createTimedCache } from "../shared/timed-cache";
import { type CanvasOwner, resolveCanvas } from "./resolve-canvas";

export const PREVIEW_REFRESH_MS = 60_000;
export const MAX_CACHED_PREVIEWS = 256; // quelques dizaines de ko chacune au plus

// Ce que le rendu dessine : le canvas, à qui il est, et son thème s'il en a un.
export type PreviewInput = { image: CanvasImage; owner: CanvasOwner; theme?: string };

export type CanvasPreviewDeps = {
  durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner">;
  redis: Pick<ArchiveWrites, "getCanvas" | "getCanvasImage">;
  render(input: PreviewInput): Promise<Uint8Array<ArrayBuffer>>;
  now(): Timestamp;
};

export type CanvasPreviews = {
  // `null` : le login n'a pas de canvas, ou Redis ne le sert pas (perdu, en récupération).
  get(login: string): Promise<Uint8Array<ArrayBuffer> | null>;
};

type Preview = Promise<Uint8Array<ArrayBuffer> | null>;

export function createCanvasPreviews({ durable, redis, render, now }: CanvasPreviewDeps): CanvasPreviews {
  const cached = createTimedCache<Preview>(MAX_CACHED_PREVIEWS, now);

  const renderLogin = async (login: string): Preview => {
    const page = await resolveCanvas(durable, login);
    if (!page || !(await redis.getCanvas(page.canvasId))) return null;
    const image = await redis.getCanvasImage(page.canvasId);
    // Pendant un agrandissement, l'état et la taille se lisent à deux instants : l'image serait de travers.
    if (!image || image.state.length !== image.width * image.height) return null;
    return render({ image, owner: page.owner, ...(page.theme ? { theme: page.theme } : {}) });
  };

  return {
    get(login) {
      const key = login.toLowerCase();
      const kept = cached.get(key);
      if (kept) return kept;
      const preview = renderLogin(key);
      cached.set(key, preview, PREVIEW_REFRESH_MS);
      // Ni un refus ni une panne ne se gardent : le canvas qui revient est servi à la demande suivante.
      const forget = (): void => {
        if (cached.get(key) === preview) cached.delete(key);
      };
      preview.then((png) => png ?? forget(), forget);
      return preview;
    },
  };
}
