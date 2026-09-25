import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./reconnect";

describe("reconnectDelayMs (§4.5, JOURNAL 2026-09-25)", () => {
  const noJitter = () => 0;

  // Attend 1 s, puis 2 s, puis 5 s, puis toujours 10 s : jamais en rafale
  it("waits 1 s, then 2 s, then 5 s, then always 10 s: never in a burst", () => {
    expect([0, 1, 2, 3, 4, 50].map((attempt) => reconnectDelayMs(attempt, noJitter))).toEqual([
      1000, 2000, 5000, 10_000, 10_000, 10_000,
    ]);
  });

  // Ajoute jusqu'à une seconde de hasard, pour que les pages ne reviennent pas toutes ensemble
  it("adds up to a second of chance, so that pages do not all come back together", () => {
    expect(reconnectDelayMs(0, () => 0.999)).toBe(1999);
    expect(reconnectDelayMs(3, () => 0.5)).toBe(10_500);
  });
});
