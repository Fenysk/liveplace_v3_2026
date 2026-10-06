import { afterEach, describe, expect, it, vi } from "vitest";
import { type CollapseStorage, createScoreboardCollapse } from "./use-scoreboard-collapse";

const createFakeStorage = (): CollapseStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

describe("the collapsed state of the scoreboard (JOURNAL 2026-10-06)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Part dépliée quand rien n'a été retenu
  it("starts unfolded when nothing was kept", () => {
    expect(createScoreboardCollapse(() => createFakeStorage()).getSnapshot()).toBe(false);
  });

  // Retient son choix d'une visite à l'autre, et prévient qui écoute
  it("keeps its choice from one visit to the next, and tells who listens", () => {
    const storage = createFakeStorage();
    const collapse = createScoreboardCollapse(() => storage);
    const listener = vi.fn();
    collapse.subscribe(listener);

    collapse.toggle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(collapse.getSnapshot()).toBe(true);

    const nextVisit = createScoreboardCollapse(() => storage);
    expect(nextVisit.getSnapshot()).toBe(true);
    nextVisit.toggle();
    expect(createScoreboardCollapse(() => storage).getSnapshot()).toBe(false);
  });

  // Cesse de prévenir qui s'est retiré
  it("stops telling who stopped listening", () => {
    const collapse = createScoreboardCollapse(() => createFakeStorage());
    const listener = vi.fn();
    const stop = collapse.subscribe(listener);

    stop();
    collapse.toggle();

    expect(listener).not.toHaveBeenCalled();
  });

  // Reste utilisable quand le stockage refuse de lire ou d'écrire : déplié, et le choix tient pour la visite
  it("stays usable when the storage refuses to read or write: unfolded, and the choice holds for the visit", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refusing = (): CollapseStorage => ({
      getItem: () => {
        throw new Error("stockage refusé");
      },
      setItem: () => {
        throw new Error("stockage refusé");
      },
    });
    const collapse = createScoreboardCollapse(refusing);

    expect(collapse.getSnapshot()).toBe(false);
    collapse.toggle();
    expect(collapse.getSnapshot()).toBe(true);
  });
});
