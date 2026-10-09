import { describe, expect, it } from "vitest";
import { easingCurve, toMilliseconds } from "./motion";

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

describe("easingCurve (tokens.css, mouvement)", () => {
  const DESIGN_SYSTEM_CURVE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

  // Quand JavaScript anime, il suit la courbe du design system : de 0 à 1, vite d'abord puis de plus en plus doucement
  it("follows the design system curve: 0 to 1, quick then ever gentler", () => {
    const ease = easingCurve(DESIGN_SYSTEM_CURVE);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeGreaterThan(0.7);
    let previous = 0;
    for (let step = 1; step <= 20; step += 1) {
      const value = ease(step / 20);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  // Une courbe droite se lit comme l'identité : le calcul retombe sur ses pieds
  it("reads a straight curve as the identity", () => {
    const ease = easingCurve("cubic-bezier(0.25, 0.25, 0.75, 0.75)");
    for (const progress of [0.1, 0.3, 0.5, 0.9]) expect(ease(progress)).toBeCloseTo(progress);
  });

  // Si la courbe est illisible (variable absente, mot-clé), le mouvement reste linéaire plutôt que de se casser
  it("falls back to a linear move for a curve it cannot read", () => {
    for (const css of ["ease", "", "cubic-bezier(1, 2)"]) expect(easingCurve(css)(0.4)).toBeCloseTo(0.4);
  });
});
