import { describe, expect, it } from "vitest";
import { toMilliseconds } from "./motion";

describe("toMilliseconds (tokens.css, mouvement)", () => {
  // Lit une durée CSS comme tokens.css l'écrit, en secondes ou en millisecondes
  it("reads a CSS duration in seconds or milliseconds", () => {
    expect(toMilliseconds("0.34s")).toBe(340);
    expect(toMilliseconds(".2s")).toBe(200);
    expect(toMilliseconds("140ms")).toBe(140);
  });

  // Sans durée lisible (mouvement réduit, variable absente), il n'y a pas d'animation
  it("gives 0 for a reduced motion or an unreadable value", () => {
    expect(toMilliseconds("0s")).toBe(0);
    expect(toMilliseconds("")).toBe(0);
    expect(toMilliseconds("vite")).toBe(0);
  });
});
