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
    removeItem: (key) => {
      entries.delete(key);
    },
  };
};

const refuse = (): never => {
  throw new Error("stockage refusé");
};

const refusing = (): BubbleStorage => ({ getItem: refuse, setItem: refuse, removeItem: refuse });

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
    const storage: BubbleStorage = { ...refusing(), getItem: () => null };
    const seen = createSeenBubbles(() => storage);

    seen.markSeen("first-hint");

    expect(seen.isSeen("first-hint")).toBe(true);
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : rejouer le tutoriel efface les bulles vues, et elles reviennent à leur moment
describe("oublier des bulles vues (Écart §8.1, JOURNAL 2026-10-12)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Les clés oubliées ne sont plus vues, ici et à la visite suivante ; les autres le restent
  it("forgets only the keys it is given, now and on the next visit", () => {
    const storage = createFakeStorage();
    const seen = createSeenBubbles(() => storage);
    seen.markSeen("first-hint");
    seen.markSeen("draft-trace");
    seen.markSeen("first-draft");

    seen.forget(["first-hint", "draft-trace"]);

    expect(seen.isSeen("first-hint")).toBe(false);
    expect(seen.isSeen("draft-trace")).toBe(false);
    expect(seen.isSeen("first-draft")).toBe(true);
    const nextVisit = createSeenBubbles(() => storage);
    expect(nextVisit.isSeen("first-hint")).toBe(false);
    expect(nextVisit.isSeen("first-draft")).toBe(true);
  });

  // Une clé jamais lue pendant la visite s'oublie aussi : elle est dans le stockage, pas dans la mémoire de la page
  it("forgets a key stored by an earlier visit that this page never read", () => {
    const storage = createFakeStorage();
    createSeenBubbles(() => storage).markSeen("obs-tab");
    const seen = createSeenBubbles(() => storage);

    seen.forget(["obs-tab"]);

    expect(storage.entries.size).toBe(0);
    expect(seen.isSeen("obs-tab")).toBe(false);
  });

  // Prévient qui écoute, une seule fois pour tout ce qu'on oublie ; oublier une bulle déjà oubliée ne casse rien
  it("tells who listens once for everything forgotten, and forgetting twice breaks nothing", () => {
    const seen = createSeenBubbles(() => createFakeStorage());
    const listener = vi.fn();
    seen.subscribe(listener);
    seen.markSeen("first-hint");
    seen.markSeen("draft-trace");
    listener.mockClear();

    seen.forget(["first-hint", "draft-trace"]);
    expect(listener).toHaveBeenCalledTimes(1);
    seen.forget(["first-hint", "draft-trace"]);

    expect(seen.isSeen("first-hint")).toBe(false);
    expect(seen.isSeen("draft-trace")).toBe(false);
  });

  // Un stockage qui refuse d'effacer garde la bulle comme elle était : comptée vue, et le dit en console
  it("keeps a bubble seen when the storage refuses to erase it, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage: BubbleStorage = { ...refusing(), getItem: () => "1" };
    const seen = createSeenBubbles(() => storage);

    seen.forget(["first-hint"]);

    expect(seen.isSeen("first-hint")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
