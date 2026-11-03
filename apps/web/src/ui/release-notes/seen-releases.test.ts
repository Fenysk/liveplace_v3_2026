import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeenReleases, type SeenStorage } from "./seen-releases";

const createFakeStorage = (): SeenStorage & { entries: Map<string, string> } => {
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

const refusing = (): SeenStorage => ({ getItem: refuse, setItem: refuse });

describe("ce qui est lu des Nouveautés, par appareil", () => {
  afterEach(() => vi.restoreAllMocks());

  // Quand rien n'est retenu, rien n'est lu
  it("reads nothing when nothing was kept", () => {
    expect(createSeenReleases(() => createFakeStorage()).isRead("2026-11-06:viewer")).toBe(false);
  });

  // Le lu se retient par clé seulement, et d'une visite à l'autre
  it("keeps what is read by its key only, from one visit to the next", () => {
    const storage = createFakeStorage();
    createSeenReleases(() => storage).markRead("2026-11-06:viewer");

    const nextVisit = createSeenReleases(() => storage);
    expect(nextVisit.isRead("2026-11-06:viewer")).toBe(true);
    expect(nextVisit.isRead("2026-11-06:owner")).toBe(false);
    expect(nextVisit.isRead("2026-11-20:viewer")).toBe(false);
  });

  // Les clés ne se mêlent pas à celles des bulles vues : le magasin a son préfixe à lui
  it("writes its keys under a prefix of its own, never among the seen bubbles", () => {
    const storage = createFakeStorage();
    createSeenReleases(() => storage).markRead("2026-11-06:viewer");

    expect([...storage.entries.keys()]).toEqual(["liveplace:release-read:2026-11-06:viewer"]);
  });

  // Prévient qui écoute une seule fois par clé, et cesse quand il se retire
  it("tells who listens once per key, and stops when he stops listening", () => {
    const read = createSeenReleases(() => createFakeStorage());
    const listener = vi.fn();
    const stop = read.subscribe(listener);

    read.markRead("a");
    read.markRead("a");
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    read.markRead("b");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // Ne touche pas au stockage avant d'en avoir besoin : sur le serveur, `window.localStorage` n'existe pas
  it("does not reach for the storage before it needs it", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    const read = createSeenReleases(getStorage);

    read.subscribe(() => undefined);
    expect(getStorage).not.toHaveBeenCalled();
    read.isRead("a");
    expect(getStorage).toHaveBeenCalledTimes(1);
    read.isRead("a");
    expect(getStorage).toHaveBeenCalledTimes(1);
  });

  // Un stockage illisible compte tout comme lu : aucun point ne s'allume pour rien, et l'avertissement dit la clé
  it("counts everything as read when the storage cannot be read, and warns with the key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(createSeenReleases(refusing).isRead("2026-11-06:viewer")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("2026-11-06:viewer"), expect.any(Error));
  });

  // Un stockage qui refuse d'écrire garde le lu pour la page seulement, sans lever d'erreur, et prévient quand même
  it("keeps what is read for the page when the storage refuses to write, and still tells its listeners", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = { getItem: () => null, setItem: refuse };
    const read = createSeenReleases(() => storage);
    const listener = vi.fn();
    read.subscribe(listener);

    read.markRead("a");

    expect(read.isRead("a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("a"), expect.any(Error));
  });
});
