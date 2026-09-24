// Le brouillon sauvegardé dans le navigateur (CDC 2026) : une entrée par canvas et par utilisateur, écrite à chaque changement.
// Chaque accès peut échouer (fenêtre privée, stockage refusé) : un brouillon perdu est vide, jamais une page cassée.

import { toCellKey } from "@liveplace/domain";
import { z } from "zod";
import type { Draft } from "./draft";

export type DraftStorage = Pick<Storage, "getItem" | "setItem">;

// Ce qu'une case sauvegardée doit respecter pour revenir : sinon le serveur la refuserait à jamais.
export type DraftBounds = { width: number; height: number; paletteSize: number };

const SavedPixelsSchema = z.array(
  z.object({ x: z.number().int(), y: z.number().int(), colorIndex: z.number().int() }),
);

const keyOf = (canvasId: string, userId: string) => `liveplace:draft:${canvasId}:${userId}`;

export function getSavedDraft(
  getStorage: () => DraftStorage,
  canvasId: string,
  userId: string,
  bounds: DraftBounds,
): Draft {
  try {
    const raw = getStorage().getItem(keyOf(canvasId, userId));
    const parsed = SavedPixelsSchema.safeParse(raw === null ? [] : JSON.parse(raw));
    const pixels = parsed.success ? parsed.data : [];
    const inBounds = pixels.filter(
      ({ x, y, colorIndex }) =>
        x >= 0 &&
        y >= 0 &&
        x < bounds.width &&
        y < bounds.height &&
        colorIndex >= 0 &&
        colorIndex < bounds.paletteSize,
    );
    return new Map(inBounds.map((pixel) => [toCellKey(pixel.x, pixel.y), pixel]));
  } catch (error) {
    console.warn(`saved-draft : brouillon de ${canvasId} illisible, brouillon vide`, error);
    return new Map();
  }
}

export function saveDraft(
  getStorage: () => DraftStorage,
  canvasId: string,
  userId: string,
  draft: Draft,
): void {
  try {
    getStorage().setItem(keyOf(canvasId, userId), JSON.stringify([...draft.values()]));
  } catch (error) {
    console.warn(`saved-draft : brouillon de ${canvasId} non sauvegardé`, error);
  }
}
