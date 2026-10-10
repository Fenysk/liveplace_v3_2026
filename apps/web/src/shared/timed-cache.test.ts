import { describe, expect, it } from "vitest";
import { createTimedCache } from "./timed-cache";

const setup = (maxEntries = 3) => {
  let nowMs = 1_000;
  const cache = createTimedCache<string>(maxEntries, () => nowMs);
  return {
    cache,
    advance: (ms: number): void => {
      nowMs += ms;
    },
  };
};

describe("le cache à durée", () => {
  // Quand une valeur est posée pour une durée, le système doit la rendre jusqu'à la dernière milliseconde, puis l'oublier
  it("gives a value back until the last millisecond of its duration, then forgets it", () => {
    const { cache, advance } = setup();
    cache.set("a", "un", 100);

    advance(99);
    expect(cache.get("a")).toBe("un");
    advance(1);

    expect(cache.get("a")).toBeUndefined();
  });

  // Quand une clé est posée de nouveau, le système doit garder la dernière valeur et sa durée
  it("keeps the last value and duration of a key that is set again", () => {
    const { cache, advance } = setup();
    cache.set("a", "un", 100);
    advance(60);

    cache.set("a", "deux", 100);
    advance(60);

    expect(cache.get("a")).toBe("deux");
  });

  // Quand une clé est retirée, le système ne doit plus la rendre
  it("gives nothing back for a key that was deleted", () => {
    const { cache } = setup();
    cache.set("a", "un", 100);

    cache.delete("a");

    expect(cache.get("a")).toBeUndefined();
  });

  // Quand le plafond est dépassé, le système doit oublier la plus ancienne clé et garder les autres
  it("forgets the oldest key once past the cap, and keeps the others", () => {
    const { cache } = setup(3);
    for (const key of ["a", "b", "c", "d"]) cache.set(key, key, 100);

    expect(cache.get("a")).toBeUndefined();
    expect(["b", "c", "d"].map((key) => cache.get(key))).toEqual(["b", "c", "d"]);
  });

  // Quand une clé expirée est en tête, le système doit l'oublier avant d'en poser une autre, sans toucher aux vivantes
  it("drops the expired keys at the head before setting another, and leaves the live ones", () => {
    const { cache, advance } = setup(3);
    cache.set("a", "a", 50);
    cache.set("b", "b", 500);
    cache.set("c", "c", 500);
    advance(60);

    cache.set("d", "d", 500);

    expect(["a", "b", "c", "d"].map((key) => cache.get(key))).toEqual([undefined, "b", "c", "d"]);
  });
});
