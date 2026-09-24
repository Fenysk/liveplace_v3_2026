import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Draft } from "./draft";
import { type DraftStorage, getSavedDraft, saveDraft } from "./saved-draft";

const bounds = { width: 16, height: 16, paletteSize: 43 };

const memoryStorage = (): DraftStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const refusingStorage: DraftStorage = {
  getItem: () => {
    throw new Error("stockage refusé");
  },
  setItem: () => {
    throw new Error("stockage refusé");
  },
};

const draft: Draft = new Map([
  [toCellKey(3, 1), { x: 3, y: 1, colorIndex: 4 }],
  [toCellKey(0, 2), { x: 0, y: 2, colorIndex: 0 }],
]);

describe("saved draft (CDC 2026)", () => {
  // Relit le brouillon sauvegardé tel quel, dans le même ordre
  it("reads the saved draft back as is, in the same order", () => {
    const storage = memoryStorage();

    saveDraft(() => storage, "canvas-1", "user-1", draft);

    expect([...getSavedDraft(() => storage, "canvas-1", "user-1", bounds).entries()]).toEqual([
      ...draft.entries(),
    ]);
  });

  // Garde un brouillon par canvas et par utilisateur
  it("keeps one draft per canvas and per user", () => {
    const storage = memoryStorage();

    saveDraft(() => storage, "canvas-1", "user-1", draft);

    expect(getSavedDraft(() => storage, "canvas-2", "user-1", bounds).size).toBe(0);
    expect(getSavedDraft(() => storage, "canvas-1", "user-2", bounds).size).toBe(0);
  });

  // Rend un brouillon vide, jamais une erreur, quand la sauvegarde est absente, illisible ou le stockage refusé
  it("gives an empty draft, never an error, when the save is missing, unreadable, or storage is refused", () => {
    const storage = memoryStorage();
    storage.entries.set("liveplace:draft:canvas-1:user-1", "{ pas du json");

    expect(getSavedDraft(() => memoryStorage(), "canvas-1", "user-1", bounds).size).toBe(0);
    expect(getSavedDraft(() => storage, "canvas-1", "user-1", bounds).size).toBe(0);
    expect(getSavedDraft(() => refusingStorage, "canvas-1", "user-1", bounds).size).toBe(0);
    expect(() => saveDraft(() => refusingStorage, "canvas-1", "user-1", draft)).not.toThrow();
  });

  // Écarte une case sauvegardée hors du canvas ou hors de la palette
  it("drops a saved cell outside the canvas or the palette", () => {
    const storage = memoryStorage();
    storage.entries.set(
      "liveplace:draft:canvas-1:user-1",
      JSON.stringify([
        { x: 3, y: 1, colorIndex: 4 },
        { x: 16, y: 0, colorIndex: 4 },
        { x: 0, y: 0, colorIndex: 43 },
      ]),
    );

    expect([...getSavedDraft(() => storage, "canvas-1", "user-1", bounds).values()]).toEqual([
      { x: 3, y: 1, colorIndex: 4 },
    ]);
  });
});
