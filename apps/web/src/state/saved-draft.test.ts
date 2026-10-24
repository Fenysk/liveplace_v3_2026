import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Draft } from "./draft";
import { type DraftStorage, getSavedDraft, isSavedDraftStale, saveDraft } from "./saved-draft";

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

describe("saved draft and pixels moved by a resize (Écart §5.3, JOURNAL 2026-10-24)", () => {
  const key = "liveplace:draft:canvas-1:user-1";

  // Sans rapprochement, la sauvegarde reste la liste de cases d'avant ; avec un, elle garde la version qu'elle connaît
  it("keeps the old list of cells when no move happened, and the known version beside the cells when one did", () => {
    const plain = memoryStorage();
    const stamped = memoryStorage();

    saveDraft(() => plain, "canvas-1", "user-1", draft);
    saveDraft(() => stamped, "canvas-1", "user-1", draft, 12);

    expect(JSON.parse(plain.entries.get(key) ?? "null")).toEqual([...draft.values()]);
    expect(JSON.parse(stamped.entries.get(key) ?? "null")).toEqual({
      movedAtVersion: 12,
      pixels: [...draft.values()],
    });
  });

  // Relit le brouillon sous la version qu'il a connue, et le jette sous une autre
  it("reads the draft back under the version it knew, and throws it away under another", () => {
    const storage = memoryStorage();
    saveDraft(() => storage, "canvas-1", "user-1", draft, 12);

    expect(getSavedDraft(() => storage, "canvas-1", "user-1", { ...bounds, movedAtVersion: 12 }).size).toBe(
      2,
    );
    expect(getSavedDraft(() => storage, "canvas-1", "user-1", { ...bounds, movedAtVersion: 15 }).size).toBe(
      0,
    );
    expect(getSavedDraft(() => storage, "canvas-1", "user-1", bounds).size).toBe(0);
  });

  // Un brouillon d'avant tous les rapprochements (la liste seule) est périmé dès qu'un rapprochement a eu lieu
  it("takes a draft saved as the old list as saved before any move: stale as soon as one happened", () => {
    const storage = memoryStorage();
    saveDraft(() => storage, "canvas-1", "user-1", draft);

    expect(getSavedDraft(() => storage, "canvas-1", "user-1", bounds).size).toBe(2);
    expect(getSavedDraft(() => storage, "canvas-1", "user-1", { ...bounds, movedAtVersion: 12 }).size).toBe(
      0,
    );
    expect(isSavedDraftStale(() => storage, "canvas-1", "user-1", 12)).toBe(true);
  });

  // Dit périmé seulement un brouillon non vide sauvegardé sous une autre version ; jamais une erreur
  it("calls stale only a non-empty draft saved under another version, never an error", () => {
    const storage = memoryStorage();
    saveDraft(() => storage, "canvas-1", "user-1", draft, 12);
    const empty = memoryStorage();
    saveDraft(() => empty, "canvas-1", "user-1", new Map(), 12);

    expect(isSavedDraftStale(() => storage, "canvas-1", "user-1", 12)).toBe(false);
    expect(isSavedDraftStale(() => storage, "canvas-1", "user-1", 15)).toBe(true);
    expect(isSavedDraftStale(() => empty, "canvas-1", "user-1", 15)).toBe(false);
    expect(isSavedDraftStale(() => memoryStorage(), "canvas-1", "user-1", 15)).toBe(false);
    expect(isSavedDraftStale(() => refusingStorage, "canvas-1", "user-1", 15)).toBe(false);
  });
});
