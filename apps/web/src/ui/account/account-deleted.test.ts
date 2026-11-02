import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetDevice, rememberAccountDeleted, takeAccountDeleted } from "./account-deleted";

afterEach(() => {
  vi.restoreAllMocks();
});

// Un stockage de navigateur en mémoire : `key(index)` suit l'ordre d'insertion, comme `localStorage`.
const createStorage = (initial: Record<string, string> = {}) => {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    storage: {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (name: string) => entries.get(name) ?? null,
      setItem: (name: string, value: string) => void entries.set(name, value),
      removeItem: (name: string) => void entries.delete(name),
    },
  };
};

describe("what the device forgets when the account is deleted (CDC §8, inventory of 2026-11-01)", () => {
  // Toutes les clés de LivePlace partent : brouillons de chaque fresque, vue, apparence, bulles, compteurs ; pas celles des autres
  it("removes every key of LivePlace, drafts included, and none of anyone else's", () => {
    const { entries, storage } = createStorage({
      "liveplace:draft:canvas-1:1234": "[]",
      "liveplace:draft:canvas-2:1234": "[]",
      "liveplace:viewport:canvas-1": "{}",
      "liveplace:theme": "dark",
      "liveplace:bubble-seen:obs-link": "1",
      "liveplace:first-hint-steps": "[]",
      "liveplace:placement-count": "3",
      "liveplace:scoreboard-collapsed": "1",
      "autre:cle": "reste",
      liveplaces: "reste aussi",
    });

    forgetDevice(() => storage);

    expect([...entries.keys()]).toEqual(["autre:cle", "liveplaces"]);
  });

  // Plusieurs clés de suite : retirer l'une ne fait pas sauter la suivante
  it("removes consecutive keys, none being skipped when the positions shift", () => {
    const { entries, storage } = createStorage(
      Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`liveplace:key-${index}`, "x"])),
    );

    forgetDevice(() => storage);

    expect(entries.size).toBe(0);
  });

  // Un stockage vide ou refusé ne casse rien : la page part quand même
  it("breaks nothing on an empty storage, nor on one the browser refuses", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    forgetDevice(() => createStorage().storage);
    expect(() =>
      forgetDevice(() => {
        throw new DOMException("refusé", "SecurityError");
      }),
    ).not.toThrow();

    expect(warned).toHaveBeenCalledTimes(1);
  });

  // Les journaux ne portent aucun identifiant : ni compte, ni fresque
  it("logs nothing that names an account when the storage refuses", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage } = createStorage({ "liveplace:draft:canvas-1:1234": "[]" });
    storage.removeItem = () => {
      throw new Error("refusé");
    };

    forgetDevice(() => storage);

    expect(JSON.stringify(warned.mock.calls)).not.toContain("1234");
  });
});

describe("the word the page leaves for the home page (CDC §8, Toasts)", () => {
  // Laissé par la page qui supprime, lu une seule fois à l'accueil
  it("is left by the page that deleted, and read once", () => {
    const { storage } = createStorage();

    expect(takeAccountDeleted(() => storage)).toBe(false);
    rememberAccountDeleted(() => storage);

    expect(takeAccountDeleted(() => storage)).toBe(true);
    expect(takeAccountDeleted(() => storage)).toBe(false);
  });

  // Un stockage refusé : pas de mot, pas d'erreur
  it("is simply not left when the storage refuses, and never throws", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refusing = () => {
      throw new Error("refusé");
    };

    expect(() => rememberAccountDeleted(refusing)).not.toThrow();
    expect(takeAccountDeleted(refusing)).toBe(false);
  });
});
