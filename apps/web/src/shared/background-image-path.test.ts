import { describe, expect, it } from "vitest";
import { backgroundImagePath } from "./background-image-path";

describe("backgroundImagePath (Écart §9.1, JOURNAL 2026-10-10)", () => {
  // Quand une image date d'un instant, le système doit en faire une adresse du même domaine, qui porte cet instant
  it("makes a same-domain address that carries the instant of the image", () => {
    expect(backgroundImagePath("fenysk", 1_760_000_000_000)).toBe("/fenysk/background?v=1760000000000");
  });

  // Un pseudo ne sort jamais du chemin : tout ce qui n'est pas sûr dans une adresse est codé
  it("never lets a login out of the path: whatever is not safe in an address is encoded", () => {
    expect(backgroundImagePath("a/b?c", 5)).toBe("/a%2Fb%3Fc/background?v=5");
  });
});
