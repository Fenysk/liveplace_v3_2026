import { describe, expect, it } from "vitest";
import { predictGauge } from "./gauge";

const refill = { refillMs: 10_000, refillCharges: 1 };
const gauge = { charges: 3, max: 10, nextRefillAt: 50_000 };

describe("predictGauge (§9.4)", () => {
  // Rend la jauge telle quelle avant la prochaine recharge
  it("gives the gauge as is before the next refill", () => {
    expect(predictGauge(gauge, refill, 49_999)).toEqual(gauge);
  });

  // Ajoute refillCharges quand le compte à rebours arrive à zéro, et relance le compte
  it("adds refillCharges when the countdown reaches zero, and restarts it", () => {
    expect(predictGauge(gauge, refill, 50_000)).toEqual({ charges: 4, max: 10, nextRefillAt: 60_000 });
    expect(predictGauge(gauge, refill, 75_000)).toEqual({ charges: 6, max: 10, nextRefillAt: 80_000 });
  });

  // Ne dépasse jamais le maximum
  it("never goes past the max", () => {
    expect(predictGauge(gauge, refill, 1_000_000).charges).toBe(10);
  });
});
