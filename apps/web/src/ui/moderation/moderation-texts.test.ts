import { describe, expect, it } from "vitest";
import { pixelCountLabel, reportCountLabel } from "./moderation-texts";

describe("reportCountLabel (JOURNAL 2026-09-28)", () => {
  // Accorde le nombre de signalements
  it("agrees the number of reports", () => {
    expect(reportCountLabel(1)).toBe("1 signalement");
    expect(reportCountLabel(3)).toBe("3 signalements");
  });
});

describe("pixelCountLabel (JOURNAL 2026-09-25)", () => {
  // Dit aucun, un, ou le nombre, avec les espaces de milliers du français
  it("says none, one, or the count, with French thousands separators", () => {
    expect(pixelCountLabel(0)).toBe("Aucun pixel visible");
    expect(pixelCountLabel(1)).toBe("1 pixel");
    expect(pixelCountLabel(37)).toBe("37 pixels");
    expect(pixelCountLabel(4101)).toBe(`${(4101).toLocaleString("fr-FR")} pixels`);
  });
});
