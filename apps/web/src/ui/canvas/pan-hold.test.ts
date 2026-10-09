import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGestureTracker, type PointerInput } from "./gestures";

// Écart §8.1 (JOURNAL 2026-10-09) : sur mobile, le haut revient dès le dernier doigt levé. Plus de maintien (ce fichier en
// portait les tests, d'où son nom) : la scène pose `data-panning` pendant un déplacement ou un pincement, le CSS le lit seul.

const read = (...path: string[]) => readFileSync(join(import.meta.dirname, ...path), "utf8");
const scene = read("canvas-scene.ts");
const pixelCanvas = read("pixel-canvas.tsx");
const pillCss = read("..", "design", "pill.css");

const finger = (pointerId: number, x: number, y: number): PointerInput => ({
  pointerId,
  pointerType: "touch",
  button: 0,
  point: { x, y },
});

describe("le geste de vue, de la scène au CSS (Écart §8.1, JOURNAL 2026-10-09)", () => {
  // Le CSS lit l'attribut que la scène écrit, au PC comme sur mobile ; si l'un le renomme, le haut ne s'efface plus
  it("has the CSS read the very attribute the scene writes, on a PC and on mobile", () => {
    expect(scene).toContain('const PANNING_ATTRIBUTE = "data-panning";');
    expect(pillCss).toContain("html[data-panning] .lp-floating {");
    expect(pillCss).toContain("html[data-panning] .lp-floating:is(");
  });

  // Un doigt qui glisse au-delà de la tolérance déplace la vue : la scène pose l'attribut dès le premier déplacement
  it("sets the attribute as soon as a finger drags past the tolerance", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 100));

    expect(tracker.move(finger(1, 140, 100)).kind).toBe("pan");
    expect(scene).toMatch(/case "pan":\s*setPanning\(true\);/);
  });

  // Deux doigts qui s'écartent pincent : même attribut
  it("sets the attribute as soon as two fingers pinch", () => {
    const tracker = createGestureTracker();
    tracker.press(finger(1, 100, 300));
    tracker.press(finger(2, 200, 300));

    expect(tracker.move(finger(2, 260, 300)).kind).toBe("pinch");
    expect(scene).toMatch(/case "pinch": \{\s*setPanning\(true\);/);
  });

  // Un toucher, un trait en Dessin et le zoom à la molette n'effacent rien : ni déplacement ni pincement, et la scène ne
  // pose l'attribut qu'à ces deux gestes
  it("never sets the attribute for a tap, a stroke in Draft mode or a wheel zoom", () => {
    const tap = createGestureTracker();
    tap.press(finger(1, 100, 100));
    const stroke = createGestureTracker({ isTouchTracing: () => true });
    stroke.press(finger(1, 100, 100));

    expect(tap.release(finger(1, 102, 100)).kind).toBe("target");
    expect(stroke.move(finger(1, 160, 100)).kind).toBe("trace");
    expect(scene.match(/setPanning\(true\)/g)).toHaveLength(2);
  });

  // Les pills reviennent quand le dernier doigt se lève, pas au premier d'un pincement
  it("lifts the attribute when the last finger is up, not at the first one of a pinch", () => {
    expect(scene).toMatch(
      /const liftPointer = \(pointerId: number\) => \{\s*pressedPointers\.delete\(pointerId\);\s*if \(pressedPointers\.size > 0\) return;\s*setPanning\(false\);/,
    );
  });

  // Un doigt levé et un geste annulé par le système (appel, notification) rendent le haut de même
  it("lifts it on a finger up and on a gesture cancelled by the system", () => {
    expect(scene).toMatch(/"pointerup",\s*\(event\) => \{\s*liftPointer\(event\.pointerId\);/);
    expect(scene).toMatch(/"pointercancel",\s*\(event\) => \{\s*liftPointer\(event\.pointerId\);/);
  });

  // Quitter la page ne laisse pas le haut effacé
  it("lifts it when the canvas leaves the page", () => {
    expect(scene).toMatch(/dispose\(\) \{[^}]*setPanning\(false\);/);
  });

  // Aucun délai entre le dernier doigt levé et le retour : la levée est synchrone, sans minuterie dans son chemin
  it("puts no timer between the last finger up and the lifting", () => {
    const lift = /const liftPointer = [\s\S]*?\n {2}\};/.exec(scene)?.[0] ?? "";

    expect(lift).toContain("setPanning(false);");
    expect(lift).not.toMatch(/setTimeout|requestAnimationFrame|schedule/);
  });

  // Le canvas ne monte que sa scène : plus de maintien, ni sur la page de jeu ni sur l'archive, qui montent toutes deux un canvas
  it("mounts the scene alone: no hold behind it, wherever a canvas is mounted", () => {
    expect(pixelCanvas).toContain("createCanvasScene(");
    expect(pixelCanvas).not.toMatch(/usePanHold|use-pan-hold/);
  });

  // Le mécanisme du délai est supprimé, pas laissé à zéro
  it("has deleted the delay mechanism rather than leaving it at zero", () => {
    expect(existsSync(join(import.meta.dirname, "pan-hold.ts"))).toBe(false);
    expect(existsSync(join(import.meta.dirname, "use-pan-hold.ts"))).toBe(false);
  });

  // Rien dans les sources n'en garde le nom : ni attribut, ni constante, ni hook
  it("keeps no trace of the hold in the web sources", () => {
    const srcRoot = join(import.meta.dirname, "..", "..");
    const sources = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => /\.(ts|tsx|css)$/.test(file) && !file.endsWith(".test.ts"));
    const holders = sources.filter((file) =>
      /pan-hold|PAN_HOLD|panHold|PanHold/.test(readFileSync(join(srcRoot, file), "utf8")),
    );

    expect(sources.length).toBeGreaterThan(100);
    expect(holders).toEqual([]);
  });
});
