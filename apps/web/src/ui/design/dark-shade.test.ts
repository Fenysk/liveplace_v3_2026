import { describe, expect, it } from "vitest";
import { darkShade } from "./dark-shade";

describe("les teintes de l'apparence sombre", () => {
  // Quand une teinte est demandée par son nom, le système doit rendre celle du bloc sombre de tokens.css, pas celle du clair
  it("gives the shade of the dark block of tokens.css, not the light one", () => {
    expect(darkShade("--void")).toBe("#10121c");
    expect(darkShade("--checker-a")).toBe("#262836");
  });

  // Quand deux noms ne diffèrent que par un suffixe, le système ne doit pas confondre l'un avec l'autre
  it("does not mistake a name for another that only extends it", () => {
    expect(darkShade("--void-dot")).toBe("#1c1e2a");
    expect(darkShade("--ink")).toBe("#f6e8e0");
  });

  // Quand le nom est un jeton commun aux deux apparences, le système doit le rendre, le bloc sombre n'ayant pas le sien
  it("falls back on the tokens shared by both appearances", () => {
    expect(darkShade("--png-white")).toBe("#ffffff");
    expect(darkShade("--twitch")).toBe("#9146ff");
  });

  // Si le nom n'est pas une teinte écrite en hexadécimal dans le bloc sombre, alors le système doit refuser en le nommant
  it("refuses a name that is not a hexadecimal shade of the dark block, naming it", () => {
    expect(() => darkShade("--nothing")).toThrow(/--nothing/);
    expect(() => darkShade("--canvas-border")).toThrow(/--canvas-border/);
  });
});
