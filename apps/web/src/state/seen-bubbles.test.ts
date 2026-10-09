import { afterEach, describe, expect, it, vi } from "vitest";
import { type BubbleStorage, createSeenBubbles } from "./seen-bubbles";

const createFakeStorage = (): BubbleStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const refusing = (): BubbleStorage => ({
  getItem: () => {
    throw new Error("stockage refusé");
  },
  setItem: () => {
    throw new Error("stockage refusé");
  },
});

describe("les bulles déjà vues (Écart §8.1, JOURNAL 2026-10-08)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Quand rien n'est retenu, une bulle n'est pas vue
  it("sees nothing when nothing was kept", () => {
    expect(createSeenBubbles(() => createFakeStorage()).isSeen("first-hint")).toBe(false);
  });

  // Une bulle vue l'est pour sa clé seulement, et d'une visite à l'autre
  it("keeps a seen bubble by its key only, from one visit to the next", () => {
    const storage = createFakeStorage();
    createSeenBubbles(() => storage).markSeen("draft-trace");

    const nextVisit = createSeenBubbles(() => storage);
    expect(nextVisit.isSeen("draft-trace")).toBe(true);
    expect(nextVisit.isSeen("first-hint")).toBe(false);
  });

  // Prévient qui écoute une seule fois par bulle, et cesse quand il se retire
  it("tells who listens once per bubble, and stops when he stops listening", () => {
    const seen = createSeenBubbles(() => createFakeStorage());
    const listener = vi.fn();
    const stop = seen.subscribe(listener);

    seen.markSeen("first-hint");
    seen.markSeen("first-hint");
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    seen.markSeen("draft-trace");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // Ne touche pas au stockage avant d'en avoir besoin : sur le serveur, `window.localStorage` n'existe pas
  it("does not reach for the storage before it needs it", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    createSeenBubbles(getStorage);
    expect(getStorage).not.toHaveBeenCalled();
  });

  // Quand le stockage refuse de lire, la bulle compte comme vue : elle ne pourrait jamais se retenir, elle ne s'affiche donc pas
  it("counts a bubble as seen when the storage refuses to read, since it could never be kept", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(createSeenBubbles(refusing).isSeen("first-hint")).toBe(true);
  });

  // Quand il refuse d'écrire, la bulle reste vue pour la visite en cours
  it("keeps a bubble seen for the visit when the storage refuses to write", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage: BubbleStorage = { getItem: () => null, setItem: refusing().setItem };
    const seen = createSeenBubbles(() => storage);

    seen.markSeen("first-hint");

    expect(seen.isSeen("first-hint")).toBe(true);
  });
});
