import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewportSaver, getSavedViewport, type ViewportStorage } from "./saved-viewport";

const createFakeStorage = (): ViewportStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
};

const VIEWPORT = { scale: 12, offsetX: -300, offsetY: 40 };

describe("saved viewport (CDC 2026, F5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Le viewport est écrit 1 s après le dernier geste, pas avant
  it("writes the viewport 1 s after the last move, not before", () => {
    const storage = createFakeStorage();
    const saver = createViewportSaver(() => storage, "cv-1");
    saver.save({ ...VIEWPORT, scale: 3 });
    vi.advanceTimersByTime(500);
    saver.save(VIEWPORT);
    vi.advanceTimersByTime(999);
    expect(getSavedViewport(() => storage, "cv-1")).toBeNull();
    vi.advanceTimersByTime(1);
    expect(getSavedViewport(() => storage, "cv-1")).toEqual(VIEWPORT);
  });

  // Une entrée par canvas : le viewport d'un canvas ne s'applique jamais à un autre
  it("keeps one entry per canvas", () => {
    const storage = createFakeStorage();
    createViewportSaver(() => storage, "cv-1").save(VIEWPORT);
    vi.advanceTimersByTime(1000);
    expect(storage.getItem("liveplace:viewport:cv-1")).not.toBeNull();
    expect(getSavedViewport(() => storage, "cv-2")).toBeNull();
  });

  // Une entrée illisible ou invalide donne l'arrivée
  it("gives null for an unreadable or invalid entry", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = createFakeStorage();
    for (const raw of [
      "pas du json",
      "null",
      '{"scale":-1,"offsetX":0,"offsetY":0}',
      '{"scale":"12","offsetX":0,"offsetY":0}',
    ]) {
      storage.setItem("liveplace:viewport:cv-1", raw);
      expect(getSavedViewport(() => storage, "cv-1")).toBeNull();
    }
  });

  // Un stockage refusé (fenêtre privée) ne casse jamais la page
  it("never breaks when the browser refuses storage", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = (): ViewportStorage => {
      throw new Error("SecurityError");
    };
    expect(getSavedViewport(refused, "cv-1")).toBeNull();
    createViewportSaver(refused, "cv-1").save(VIEWPORT);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});
