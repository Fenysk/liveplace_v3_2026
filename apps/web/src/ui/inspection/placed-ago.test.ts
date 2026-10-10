import { describe, expect, it } from "vitest";
import { formatPlacedAgo } from "./placed-ago";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatPlacedAgo (CDC 2026, inspection)", () => {
  // Sous une minute, la pose vient d'avoir lieu
  it("says « à l’instant » under a minute, and for a clock slightly ahead", () => {
    expect(formatPlacedAgo(NOW - 30_000, NOW, "fr")).toBe("à l’instant");
    expect(formatPlacedAgo(NOW + 2_000, NOW, "fr")).toBe("à l’instant");
  });

  // Au-delà, la plus grande unité entière : minutes, heures, jours
  it("counts in minutes, then hours, then days", () => {
    expect(formatPlacedAgo(NOW - 5 * MINUTE, NOW, "fr")).toBe("il y a 5 minutes");
    expect(formatPlacedAgo(NOW - 3 * HOUR, NOW, "fr")).toBe("il y a 3 heures");
    expect(formatPlacedAgo(NOW - DAY, NOW, "fr")).toBe("hier");
    expect(formatPlacedAgo(NOW - 3 * DAY, NOW, "fr")).toBe("il y a 3 jours");
  });

  // En anglais, les mêmes unités et les mêmes seuils, dits à l'anglaise
  it("says the same ago in English", () => {
    expect(formatPlacedAgo(NOW - 30_000, NOW, "en")).toBe("just now");
    expect(formatPlacedAgo(NOW - 5 * MINUTE, NOW, "en")).toBe("5 minutes ago");
    expect(formatPlacedAgo(NOW - MINUTE, NOW, "en")).toBe("1 minute ago");
    expect(formatPlacedAgo(NOW - 3 * HOUR, NOW, "en")).toBe("3 hours ago");
    expect(formatPlacedAgo(NOW - DAY, NOW, "en")).toBe("yesterday");
    expect(formatPlacedAgo(NOW - 3 * DAY, NOW, "en")).toBe("3 days ago");
  });
});
