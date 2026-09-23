// Le viewport retrouvé après F5 (CDC 2026) : une entrée par canvas, écrite 1 s après le dernier geste.
// Chaque accès peut échouer (fenêtre privée, stockage refusé) : un viewport perdu donne l'arrivée, jamais une page cassée.

import { z } from "zod";
import type { Viewport } from "./viewport";

export type ViewportStorage = Pick<Storage, "getItem" | "setItem">;
export type ViewportSaver = { save(viewport: Viewport): void; cancel(): void };

const SAVE_DELAY_MS = 1000;

const ViewportSchema = z.object({ scale: z.number().positive(), offsetX: z.number(), offsetY: z.number() });

const keyOf = (canvasId: string) => `liveplace:viewport:${canvasId}`;

export function getSavedViewport(getStorage: () => ViewportStorage, canvasId: string): Viewport | null {
  try {
    const raw = getStorage().getItem(keyOf(canvasId));
    if (raw === null) return null;
    const parsed = ViewportSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn(`saved-viewport : viewport de ${canvasId} illisible, retour à l'arrivée`, error);
    return null;
  }
}

export function createViewportSaver(getStorage: () => ViewportStorage, canvasId: string): ViewportSaver {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = (viewport: Viewport) => {
    try {
      getStorage().setItem(keyOf(canvasId), JSON.stringify(viewport));
    } catch (error) {
      console.warn(`saved-viewport : viewport de ${canvasId} non sauvegardé`, error);
    }
  };

  return {
    // Chaque geste repousse l'écriture : seul le dernier viewport d'une série est écrit.
    save(viewport) {
      clearTimeout(timer);
      timer = setTimeout(() => write(viewport), SAVE_DELAY_MS);
    },
    cancel: () => clearTimeout(timer),
  };
}
