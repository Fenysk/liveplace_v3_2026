// La couleur active gardée d'un rechargement à l'autre : la dernière vraie couleur et la rangée des récentes, ensemble,
// pour que la rangée ne contienne jamais la couleur du bouton. Une seule mémoire pour tout l'appareil, toutes fresques
// confondues. La gomme n'y entre jamais. Chaque accès peut échouer : une couleur perdue ramène aux valeurs par défaut.

import { PALETTE, TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { z } from "zod";
import type { DraftStorage } from "./saved-draft";

export type SavedColor = { colorIndex: number; recentColorIndexes: readonly number[] };

export const SAVED_COLOR_KEY = "liveplace:saved-color";

const RECENT_COUNT = 5;

const SavedColorSchema = z.object({
  colorIndex: z.number().int(),
  recentColorIndexes: z.array(z.number().int()).length(RECENT_COUNT),
});

// Une vraie couleur : un index de la palette, jamais l'index transparent de la gomme.
const isPaletteColor = (colorIndex: number): boolean =>
  colorIndex > TRANSPARENT_COLOR_INDEX && colorIndex < PALETTE.length;

// La rangée ne doit jamais contenir la couleur gardée (le bouton), ni deux fois la même case.
const isValid = ({ colorIndex, recentColorIndexes }: SavedColor): boolean =>
  isPaletteColor(colorIndex) &&
  recentColorIndexes.every((index) => isPaletteColor(index) && index !== colorIndex) &&
  new Set(recentColorIndexes).size === RECENT_COUNT;

// Absente, illisible ou invalide : `undefined`, et l'appelant prend les valeurs de départ.
export function getSavedColor(getStorage: () => DraftStorage): SavedColor | undefined {
  try {
    const raw = getStorage().getItem(SAVED_COLOR_KEY);
    if (raw === null) return undefined;
    const parsed = SavedColorSchema.safeParse(JSON.parse(raw));
    return parsed.success && isValid(parsed.data) ? parsed.data : undefined;
  } catch (error) {
    console.warn("saved-color : couleur gardée illisible, valeurs par défaut", error);
    return undefined;
  }
}

export function saveColor(
  getStorage: () => DraftStorage,
  colorIndex: number,
  recentColorIndexes: readonly number[],
): void {
  try {
    getStorage().setItem(SAVED_COLOR_KEY, JSON.stringify({ colorIndex, recentColorIndexes }));
  } catch (error) {
    console.warn("saved-color : couleur non gardée, stockage refusé", error);
  }
}
