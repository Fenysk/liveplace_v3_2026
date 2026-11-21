import { PALETTE } from "@liveplace/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSavedColor, SAVED_COLOR_KEY, saveColor } from "./saved-color";
import type { DraftStorage } from "./saved-draft";

const createFakeStorage = (): DraftStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const refuse = (): never => {
  throw new Error("stockage refusé");
};

const refusing = (): DraftStorage => ({ getItem: refuse, setItem: refuse });

const row = [5, 28, 19, 9, 42];

// Écrit une valeur brute, comme une ancienne version ou une main étrangère la laisserait
const keep = (storage: DraftStorage & { entries: Map<string, string> }, value: unknown): void => {
  storage.entries.set(SAVED_COLOR_KEY, JSON.stringify(value));
};

describe("la couleur gardée d'un rechargement à l'autre (Dessin)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Rien n'est gardé : pas de couleur, les valeurs de départ prennent le relais
  it("returns nothing when nothing was kept", () => {
    expect(getSavedColor(() => createFakeStorage())).toBeUndefined();
  });

  // La dernière couleur et la rangée se relisent telles qu'elles ont été écrites
  it("reads back the color and the row it kept", () => {
    const storage = createFakeStorage();
    saveColor(() => storage, 12, row);

    expect(getSavedColor(() => storage)).toEqual({ colorIndex: 12, recentColorIndexes: row });
  });

  // Une seule mémoire pour tout l'appareil : une clé, sans identifiant de fresque ni de personne
  it("keeps one memory for the whole device, under one liveplace key", () => {
    const storage = createFakeStorage();
    saveColor(() => storage, 12, row);

    expect(SAVED_COLOR_KEY.startsWith("liveplace:")).toBe(true);
    expect([...storage.entries.keys()]).toEqual([SAVED_COLOR_KEY]);
    expect(JSON.parse(storage.entries.get(SAVED_COLOR_KEY) ?? "")).toEqual({
      colorIndex: 12,
      recentColorIndexes: row,
    });
  });

  // Une valeur qui n'est pas du JSON ramène aux valeurs par défaut
  it("reads nothing from a value that is not JSON", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = createFakeStorage();
    storage.entries.set(SAVED_COLOR_KEY, "pas du json");

    expect(getSavedColor(() => storage)).toBeUndefined();
  });

  // Une valeur de la mauvaise forme ramène aux valeurs par défaut
  it("reads nothing from a value of the wrong shape", () => {
    const storage = createFakeStorage();
    keep(storage, { colorIndex: "12", recentColorIndexes: row });

    expect(getSavedColor(() => storage)).toBeUndefined();
  });

  // L'index transparent (la gomme), un index hors de la palette ou non entier ne sont jamais une couleur gardée
  it("reads nothing for a color that is transparent, out of the palette, or not whole", () => {
    for (const colorIndex of [0, PALETTE.length, -1, 1.5]) {
      const storage = createFakeStorage();
      keep(storage, { colorIndex, recentColorIndexes: row });

      expect(getSavedColor(() => storage)).toBeUndefined();
    }
  });

  // Une rangée qui n'a pas cinq couleurs distinctes, valides, et sans la couleur gardée ramène aux valeurs par défaut
  it("reads nothing for a row that is not five distinct palette colors apart from the kept one", () => {
    const badRows = [
      [5, 28, 19, 9],
      [5, 28, 19, 9, 9],
      [5, 28, 19, 9, 0],
      [5, 28, 19, 9, PALETTE.length],
      [5, 28, 19, 9, 12],
    ];
    for (const recentColorIndexes of badRows) {
      const storage = createFakeStorage();
      keep(storage, { colorIndex: 12, recentColorIndexes });

      expect(getSavedColor(() => storage)).toBeUndefined();
    }
  });

  // Un stockage qui lève à la lecture, ou un accès qui n'existe pas (le serveur n'a pas de `window`), ne casse rien
  it("reads nothing and does not throw when the storage cannot be reached", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getSavedColor(refusing)).toBeUndefined();
    expect(
      getSavedColor(() => {
        throw new ReferenceError("window is not defined");
      }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  // Un stockage qui refuse d'écrire ne fait pas tomber la sélection de couleur
  it("does not throw when the storage refuses to keep the color", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => saveColor(refusing, 12, row)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
