import { describe, expect, it } from "vitest";
import { createGestureTracker, wheelFactor } from "./gestures";

const mouse = (x: number, y: number, button = 0) => ({
  pointerId: 1,
  pointerType: "mouse",
  button,
  point: { x, y },
});
const finger = (pointerId: number, x: number, y: number) => ({
  pointerId,
  pointerType: "touch",
  button: 0,
  point: { x, y },
});

describe("mouse (CDC 2026, tolérance ~4 px)", () => {
  // Un clic qui bouge de 3 px reste un clic : il vise le point d'appui, sans déplacer
  it("keeps a click that moves 3 px a click: it targets the pressed point without panning", () => {
    const tracker = createGestureTracker();
    tracker.press(mouse(100, 100));
    expect(tracker.move(mouse(103, 100))).toEqual({ kind: "none" });
    expect(tracker.release(mouse(103, 100))).toEqual({ kind: "target", point: { x: 100, y: 100 } });
  });

  // Au-delà de 4 px, c'est un glissement : il rattrape tout le chemin, puis suit, et ne vise rien au relâcher
  it("turns into a pan past 4 px, catching up the whole way, and targets nothing on release", () => {
    const tracker = createGestureTracker();
    tracker.press(mouse(100, 100));
    expect(tracker.move(mouse(105, 100))).toEqual({ kind: "pan", dx: 5, dy: 0 });
    expect(tracker.move(mouse(107, 97))).toEqual({ kind: "pan", dx: 2, dy: -3 });
    expect(tracker.release(mouse(107, 97))).toEqual({ kind: "none" });
  });

  // Le clic molette glisse dès le premier pixel, et ne vise jamais de case
  it("pans with the middle button from the first pixel and never targets", () => {
    const tracker = createGestureTracker();
    tracker.press(mouse(100, 100, 1));
    expect(tracker.move(mouse(101, 100, 1))).toEqual({ kind: "pan", dx: 1, dy: 0 });
    expect(tracker.release(mouse(101, 100, 1))).toEqual({ kind: "none" });
  });

  // Le clic droit ne fait plus rien
  it("does nothing with the right button", () => {
    const tracker = createGestureTracker();
    expect(tracker.press(mouse(100, 100, 2))).toEqual({ kind: "none" });
    expect(tracker.release(mouse(100, 100, 2))).toEqual({ kind: "none" });
  });

  // Sans bouton, la souris qui survole vise la case dessous
  it("targets the cell under the hovering mouse", () => {
    const tracker = createGestureTracker();
    expect(tracker.move(mouse(40, 50))).toEqual({ kind: "target", point: { x: 40, y: 50 } });
  });
});

describe("touch (CDC 2026, tolérance ~8 px)", () => {
  // Un doigt qui tremble de 6 px reste un toucher
  it("keeps a 6 px wobble a tap", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    expect(tracker.move(finger(1, 106, 100))).toEqual({ kind: "none" });
    expect(tracker.release(finger(1, 106, 100))).toEqual({ kind: "target", point: { x: 100, y: 100 } });
  });

  // À 9 px, c'est un glissement
  it("turns into a pan at 9 px", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    expect(tracker.move(finger(1, 109, 100))).toEqual({ kind: "pan", dx: 9, dy: 0 });
  });

  // Deux doigts pincent : l'écart entre eux donne le facteur, le point entre eux suit les doigts
  it("pinches with two fingers: their spread gives the factor, the point between them follows", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    tracker.press(finger(2, 200, 100));
    expect(tracker.move(finger(2, 300, 100))).toEqual({
      kind: "pinch",
      dx: 50,
      dy: 0,
      point: { x: 200, y: 100 },
      factor: 2,
    });
  });

  // Après un pincement, le doigt restant glisse sans saut, et ne vise rien en se levant
  it("lets the remaining finger pan without a jump after a pinch, and never tap", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    tracker.press(finger(2, 200, 100));
    expect(tracker.release(finger(2, 200, 100))).toEqual({ kind: "none" });
    expect(tracker.move(finger(1, 102, 100))).toEqual({ kind: "pan", dx: 2, dy: 0 });
    expect(tracker.release(finger(1, 102, 100))).toEqual({ kind: "none" });
  });

  // Un troisième doigt est ignoré : le pincement continue avec les deux premiers
  it("ignores a third finger", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    tracker.press(finger(2, 200, 100));
    tracker.press(finger(3, 150, 300));
    expect(tracker.move(finger(3, 150, 400))).toEqual({ kind: "none" });
    expect(tracker.move(finger(2, 300, 100)).kind).toBe("pinch");
  });

  // Un pointeur annulé par le navigateur est oublié
  it("forgets a pointer the browser cancels", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));
    tracker.cancel(1);
    expect(tracker.move(finger(1, 150, 100))).toEqual({ kind: "none" });
    expect(tracker.release(finger(1, 150, 100))).toEqual({ kind: "none" });
  });
});

describe("Toggle tracé (CDC 2026, un doigt trace, deux doigts déplacent)", () => {
  const tracing = () => createGestureTracker({ isTouchTracing: () => true });

  // Un doigt trace dès qu'il se pose, à chaque mouvement, même sous la tolérance, et finit le tracé en se levant
  it("traces with one finger from the touch, on every move even under the tolerance, and ends on lift", () => {
    const tracker = tracing();

    expect(tracker.press(finger(1, 100, 100))).toEqual({ kind: "trace", point: { x: 100, y: 100 } });
    expect(tracker.move(finger(1, 102, 100))).toEqual({ kind: "trace", point: { x: 102, y: 100 } });
    expect(tracker.release(finger(1, 102, 100))).toEqual({ kind: "traceEnd" });
  });

  // Un deuxième doigt arrête le tracé, et les deux pincent
  it("ends the trace when a second finger lands, and both pinch", () => {
    const tracker = tracing();
    tracker.press(finger(1, 100, 100));

    expect(tracker.press(finger(2, 200, 100))).toEqual({ kind: "traceEnd" });
    expect(tracker.move(finger(2, 300, 100)).kind).toBe("pinch");
    expect(tracker.release(finger(1, 100, 100))).toEqual({ kind: "none" });
  });

  // Un tracé annulé par le navigateur se termine
  it("ends a trace the browser cancels", () => {
    const tracker = tracing();
    tracker.press(finger(1, 100, 100));

    expect(tracker.cancel(1)).toEqual({ kind: "traceEnd" });
  });

  // Laisse la souris cliquer et glisser comme avant
  it("leaves the mouse clicking and panning as before", () => {
    const tracker = tracing();

    expect(tracker.press(mouse(100, 100))).toEqual({ kind: "none" });
    expect(tracker.move(mouse(110, 100))).toEqual({ kind: "pan", dx: 10, dy: 0 });
  });
});

describe("wheelFactor (CDC 2026, molette vers le curseur)", () => {
  // Molette vers soi, on dézoome ; vers l'avant, on zoome ; un aller-retour s'annule
  it("zooms out rolling toward you, in rolling away, and a round trip cancels out", () => {
    expect(wheelFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelFactor(100, 0, false) * wheelFactor(-100, 0, false)).toBeCloseTo(1);
  });

  // Un cran compté en lignes (Firefox) zoome comme le même cran compté en pixels
  it("counts a notch in lines like the same notch in pixels", () => {
    expect(wheelFactor(3, 1, false)).toBeCloseTo(wheelFactor(48, 0, false));
  });

  // Le pincement du trackpad arrive en petits pas : il zoome plus fort par pas
  it("zooms more per step for a trackpad pinch", () => {
    expect(wheelFactor(-10, 0, true)).toBeGreaterThan(wheelFactor(-10, 0, false));
  });
});
