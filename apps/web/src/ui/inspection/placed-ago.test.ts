import { describe, expect, it } from "vitest";
import { formatPlacedAgo } from "./placed-ago";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatPlacedAgo (CDC 2026, inspection)", () => {
  // Sous une minute, la pose vient d'avoir lieu
  it("says « à l’instant » under a minute, and for a clock slightly ahead", () => {
    expect(formatPlacedAgo(NOW - 30_000, NOW)).toBe("à l’instant");
    expect(formatPlacedAgo(NOW + 2_000, NOW)).toBe("à l’instant");
  });

  // Au-delà, la plus grande unité entière : minutes, heures, jours
  it("counts in minutes, then hours, then days", () => {
    expect(formatPlacedAgo(NOW - 5 * MINUTE, NOW)).toBe("il y a 5 minutes");
    expect(formatPlacedAgo(NOW - 3 * HOUR, NOW)).toBe("il y a 3 heures");
    expect(formatPlacedAgo(NOW - DAY, NOW)).toBe("hier");
    expect(formatPlacedAgo(NOW - 3 * DAY, NOW)).toBe("il y a 3 jours");
  });
});
