import { describe, expect, it } from "vitest";
import { pixelCountLabel } from "./moderation-texts";

describe("pixelCountLabel (JOURNAL 2026-09-25)", () => {
  // Dit aucun, un, ou le nombre, avec les espaces de milliers du français
  it("says none, one, or the count, with French thousands separators", () => {
    expect(pixelCountLabel(0)).toBe("Aucun pixel visible");
    expect(pixelCountLabel(1)).toBe("1 pixel");
    expect(pixelCountLabel(37)).toBe("37 pixels");
    expect(pixelCountLabel(4101)).toBe(`${(4101).toLocaleString("fr-FR")} pixels`);
  });
});
