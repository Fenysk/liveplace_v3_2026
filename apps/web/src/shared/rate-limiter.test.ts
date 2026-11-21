import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter";

function limiterAt(clock: { now: number }, maxKeys = 100) {
  return createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => clock.now, maxKeys });
}

describe("createRateLimiter", () => {
  // Un seau plein laisse passer exactement sa capacité, puis refuse en disant quand revenir.
  it("allows a burst up to the capacity, then refuses with a retry delay", () => {
    const limiter = limiterAt({ now: 0 });
    expect([1, 2, 3].map(() => limiter.take("a").allowed)).toEqual([true, true, true]);
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  // Le seau se remplit avec le temps : une demande repasse après une seconde, pas avant.
  it("lets a request through again once the bucket has refilled", () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    for (let i = 0; i < 3; i++) limiter.take("a");
    clock.now = 500;
    expect(limiter.take("a").allowed).toBe(false);
    clock.now = 1000;
    expect(limiter.take("a").allowed).toBe(true);
  });

  // Un long silence ne cumule pas : le seau ne dépasse jamais sa capacité.
  it("never refills above the capacity", () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    limiter.take("a");
    clock.now = 3_600_000;
    expect([1, 2, 3, 4].map(() => limiter.take("a").allowed)).toEqual([true, true, true, false]);
  });

  // Chaque adresse a son seau : l'une épuisée ne gêne pas les autres.
  it("keeps one bucket per key", () => {
    const limiter = limiterAt({ now: 0 });
    for (let i = 0; i < 3; i++) limiter.take("a");
    expect(limiter.take("a").allowed).toBe(false);
    expect(limiter.take("b").allowed).toBe(true);
  });

  // Au-delà du nombre d'adresses suivies, la mémoire reste bornée et le limiteur continue de répondre.
  it("stays bounded when more keys than allowed show up", () => {
    const limiter = limiterAt({ now: 0 }, 2);
    for (const key of ["a", "b", "c", "d", "e"]) expect(limiter.take(key).allowed).toBe(true);
  });
});
