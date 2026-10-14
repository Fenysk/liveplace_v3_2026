import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlacementCount, PLACEMENT_COUNT_CAP } from "./placement-count";
import type { BubbleStorage } from "./seen-bubbles";

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

describe("les dessins posés sur l'appareil (Écart §8.1, JOURNAL 2026-10-12)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Rien n'a été posé : zéro
  it("counts none where nothing was kept", () => {
    expect(createPlacementCount(() => createFakeStorage()).getCount()).toBe(0);
  });

  // Chaque dessin posé s'ajoute, et prévient qui écoute
  it("adds each placement and tells who listens", () => {
    const placements = createPlacementCount(() => createFakeStorage());
    const listener = vi.fn();
    placements.subscribe(listener);

    placements.record();
    placements.record();

    expect(placements.getCount()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  // Il plafonne à ce qui sert : au-delà, rien ne s'écrit ni ne prévient
  it("caps at what is needed, then writes and tells nothing more", () => {
    const storage = createFakeStorage();
    const placements = createPlacementCount(() => storage);
    for (let turn = 0; turn < PLACEMENT_COUNT_CAP; turn++) placements.record();
    const listener = vi.fn();
    placements.subscribe(listener);
    const setItem = vi.spyOn(storage, "setItem");

    placements.record();
    placements.record();

    expect(PLACEMENT_COUNT_CAP).toBe(3);
    expect(placements.getCount()).toBe(PLACEMENT_COUNT_CAP);
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  // Le compte se retient d'une visite à l'autre
  it("keeps the count from one visit to the next", () => {
    const storage = createFakeStorage();
    const first = createPlacementCount(() => storage);
    first.record();
    first.record();

    expect(createPlacementCount(() => storage).getCount()).toBe(2);
  });

  // Une valeur qui n'est pas un nombre, ou qui est trop haute, ne casse rien
  it("reads a stored value that is no count as none, and a too high one as the cap", () => {
    const storage = createFakeStorage();
    storage.setItem("liveplace:placement-count", "beaucoup");
    expect(createPlacementCount(() => storage).getCount()).toBe(0);
    storage.setItem("liveplace:placement-count", "-4");
    expect(createPlacementCount(() => storage).getCount()).toBe(0);
    storage.setItem("liveplace:placement-count", "2.5");
    expect(createPlacementCount(() => storage).getCount()).toBe(0);
    storage.setItem("liveplace:placement-count", "99");
    expect(createPlacementCount(() => storage).getCount()).toBe(PLACEMENT_COUNT_CAP);
  });

  // Sans stockage lisible, il compte le plafond : comme une bulle vue, il ne ferait pas revenir une bulle en boucle
  it("counts the cap when the storage refuses to read, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const placements = createPlacementCount(refusing);

    expect(placements.getCount()).toBe(PLACEMENT_COUNT_CAP);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // Quand le stockage refuse d'écrire, le compte tient pour la visite en cours
  it("keeps the count for the visit when the storage refuses to write", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage: BubbleStorage = { ...refusing(), getItem: () => null };
    const placements = createPlacementCount(() => storage);

    placements.record();

    expect(placements.getCount()).toBe(1);
  });

  // Ne touche pas au stockage avant d'en avoir besoin : sur le serveur, `window.localStorage` n'existe pas
  it("does not reach for the storage before it needs it", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    createPlacementCount(getStorage);
    expect(getStorage).not.toHaveBeenCalled();
  });

  // Oublier remet à zéro, ici et à la visite suivante, et prévient qui écoute
  it("forgets the count, now and on the next visit, and tells who listens", () => {
    const storage = createFakeStorage();
    const placements = createPlacementCount(() => storage);
    placements.record();
    placements.record();
    const listener = vi.fn();
    placements.subscribe(listener);

    placements.forget();

    expect(placements.getCount()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.entries.size).toBe(0);
    expect(createPlacementCount(() => storage).getCount()).toBe(0);
  });

  // Un stockage qui refuse d'effacer garde le compte comme il était
  it("keeps the count when the storage refuses to erase it, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage: BubbleStorage = { ...refusing(), getItem: () => "2", setItem: () => undefined };
    const placements = createPlacementCount(() => storage);

    placements.forget();

    expect(placements.getCount()).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // Cesse de prévenir qui s'est retiré
  it("stops telling who stopped listening", () => {
    const placements = createPlacementCount(() => createFakeStorage());
    const listener = vi.fn();
    const stop = placements.subscribe(listener);

    stop();
    placements.record();

    expect(listener).not.toHaveBeenCalled();
  });
});
