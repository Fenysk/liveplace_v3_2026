// Le brouillon sauvegardé dans le navigateur (CDC 2026) : une entrée par canvas et par utilisateur, écrite à chaque changement.
// Chaque accès peut échouer (fenêtre privée, stockage refusé) : un brouillon perdu est vide, jamais une page cassée.

import { toCellKey } from "@liveplace/domain";
import { z } from "zod";
import type { Draft } from "./draft";

export type DraftStorage = Pick<Storage, "getItem" | "setItem">;

// Ce qu'une case sauvegardée doit respecter pour revenir : sinon le serveur la refuserait à jamais.
// Écart §5.3 (JOURNAL 2026-10-24) : `movedAtVersion`, la version du dernier rapprochement que le canvas connaît ; un brouillon
// sauvegardé sous une autre ne revient pas, ses cases ont changé de place.
export type DraftBounds = {
  width: number;
  height: number;
  paletteSize: number;
  movedAtVersion?: number | undefined;
};

const SavedPixelsSchema = z.array(
  z.object({ x: z.number().int(), y: z.number().int(), colorIndex: z.number().int() }),
);

// Avant tout rapprochement la sauvegarde est la liste des cases ; ensuite, avec la version qu'elle connaît.
const SavedDraftSchema = z.union([
  SavedPixelsSchema.transform((pixels) => ({ movedAtVersion: 0, pixels })),
  z.object({ movedAtVersion: z.number().int().nonnegative(), pixels: SavedPixelsSchema }),
]);

const keyOf = (canvasId: string, userId: string) => `liveplace:draft:${canvasId}:${userId}`;

// Absente, illisible ou refusée : un brouillon vide, d'avant tout rapprochement.
const getSaved = (getStorage: () => DraftStorage, canvasId: string, userId: string) => {
  const nothing = { movedAtVersion: 0, pixels: [] };
  try {
    const raw = getStorage().getItem(keyOf(canvasId, userId));
    const parsed = SavedDraftSchema.safeParse(raw === null ? [] : JSON.parse(raw));
    return parsed.success ? parsed.data : nothing;
  } catch (error) {
    console.warn(`saved-draft : brouillon de ${canvasId} illisible, brouillon vide`, error);
    return nothing;
  }
};

export function getSavedDraft(
  getStorage: () => DraftStorage,
  canvasId: string,
  userId: string,
  bounds: DraftBounds,
): Draft {
  const saved = getSaved(getStorage, canvasId, userId);
  if (saved.movedAtVersion !== (bounds.movedAtVersion ?? 0)) return new Map();
  const inBounds = saved.pixels.filter(
    ({ x, y, colorIndex }) =>
      x >= 0 &&
      y >= 0 &&
      x < bounds.width &&
      y < bounds.height &&
      colorIndex >= 0 &&
      colorIndex < bounds.paletteSize,
  );
  return new Map(inBounds.map((pixel) => [toCellKey(pixel.x, pixel.y), pixel]));
}

// Un brouillon non vide sauvegardé sous une autre version que celle du canvas : un rapprochement l'a rendu faux.
export function isSavedDraftStale(
  getStorage: () => DraftStorage,
  canvasId: string,
  userId: string,
  movedAtVersion: number | undefined,
): boolean {
  const saved = getSaved(getStorage, canvasId, userId);
  return saved.pixels.length > 0 && saved.movedAtVersion !== (movedAtVersion ?? 0);
}

// Sans rapprochement connu, la liste des cases seule : les sauvegardes d'avant restent lisibles, et inchangées.
export function saveDraft(
  getStorage: () => DraftStorage,
  canvasId: string,
  userId: string,
  draft: Draft,
  movedAtVersion?: number,
): void {
  try {
    const pixels = [...draft.values()];
    getStorage().setItem(
      keyOf(canvasId, userId),
      JSON.stringify(movedAtVersion ? { movedAtVersion, pixels } : pixels),
    );
  } catch (error) {
    console.warn(`saved-draft : brouillon de ${canvasId} non sauvegardé`, error);
  }
}
