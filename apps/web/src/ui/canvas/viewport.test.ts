import { describe, expect, it } from "vitest";
import { fitViewport, panBy, viewportToCell, zoomAt, zoomLimits } from "./viewport";

const CANVAS = { width: 256, height: 256 };
const DESKTOP = { width: 1000, height: 800 };
const PHONE = { width: 390, height: 844 };

// La position fractionnaire, dans le canvas, du point visé : ce que le zoom doit garder fixe.
const canvasPosition = (
  viewport: { scale: number; offsetX: number; offsetY: number },
  x: number,
  y: number,
) => ({
  x: (x - viewport.offsetX) / viewport.scale,
  y: (y - viewport.offsetY) / viewport.scale,
});

describe("fitViewport (CDC 2026, arrivée)", () => {
  // Sur un écran large, le canvas prend 90 % de la hauteur et se centre
  it("takes 90% of the height on a wide screen, centered", () => {
    const viewport = fitViewport({ width: 1600, height: 900 }, CANVAS);
    expect(viewport.scale * 256).toBeCloseTo(810);
    expect(viewport.offsetY).toBeCloseTo(45);
    expect(viewport.offsetX).toBeCloseTo((1600 - 810) / 2);
  });

  // Sur un écran haut, il prend 90 % de la largeur, sans jamais déborder
  it("takes 90% of the width on a tall screen, never overflowing", () => {
    const viewport = fitViewport(PHONE, CANVAS);
    expect(viewport.scale * 256).toBeCloseTo(351);
    expect(viewport.offsetX).toBeCloseTo(19.5);
    expect(viewport.offsetY).toBeCloseTo((844 - 351) / 2);
    expect(viewport.offsetY + viewport.scale * 256).toBeLessThan(PHONE.height);
  });
});

describe("viewportToCell (§9.3)", () => {
  // DESKTOP : une case de 2,8125 px, le canvas de 140 à 860 en x, de 40 à 760 en y
  const viewport = fitViewport(DESKTOP, CANVAS);

  // Le premier et le dernier pixel du canvas visent les cases 0 et 255
  it("maps the first and last screen pixel of the canvas to cells 0 and 255", () => {
    expect(viewportToCell(viewport, { x: 140, y: 40 }, CANVAS)).toEqual({ x: 0, y: 0 });
    expect(viewportToCell(viewport, { x: 859.5, y: 759.5 }, CANVAS)).toEqual({ x: 255, y: 255 });
  });

  // Un pixel plus loin, c'est le vide, de chaque côté : jamais la case 256 ni la case -1
  it("gives null in the void on every side, never cell 256 or -1", () => {
    expect(viewportToCell(viewport, { x: 860, y: 400 }, CANVAS)).toBeNull();
    expect(viewportToCell(viewport, { x: 400, y: 760 }, CANVAS)).toBeNull();
    expect(viewportToCell(viewport, { x: 139.9, y: 400 }, CANVAS)).toBeNull();
    expect(viewportToCell(viewport, { x: 400, y: 39.9 }, CANVAS)).toBeNull();
  });
});

describe("zoomAt (CDC 2026, molette vers le curseur)", () => {
  const viewport = fitViewport(DESKTOP, CANVAS);
  const limits = zoomLimits(DESKTOP, CANVAS);
  const cursor = { x: 300, y: 500 };

  // La case sous le curseur ne bouge pas pendant le zoom
  it("keeps the point under the cursor fixed", () => {
    const zoomed = zoomAt(viewport, cursor, 1.5, limits);
    expect(zoomed.scale).toBeCloseTo(viewport.scale * 1.5);
    const before = canvasPosition(viewport, cursor.x, cursor.y);
    const after = canvasPosition(zoomed, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  // Un zoom avant puis arrière au même point ramène au même viewport
  it("comes back to the same viewport after zooming in then out", () => {
    const back = zoomAt(zoomAt(viewport, cursor, 1.5, limits), cursor, 1 / 1.5, limits);
    expect(back.scale).toBeCloseTo(viewport.scale);
    expect(back.offsetX).toBeCloseTo(viewport.offsetX);
    expect(back.offsetY).toBeCloseTo(viewport.offsetY);
  });

  // Au plus près, une case fait 64 px ; au plus loin, la moitié de l'échelle d'arrivée
  it("stops at 64 px per cell and at half the arrival scale", () => {
    expect(zoomAt(viewport, cursor, 1000, limits).scale).toBe(64);
    expect(zoomAt(viewport, cursor, 0.001, limits).scale).toBeCloseTo(viewport.scale / 2);
  });

  // Bloqué à une borne, le zoom ne déplace pas non plus le canvas
  it("does not move the canvas either when stuck at a bound", () => {
    const closest = zoomAt(viewport, cursor, 1000, limits);
    expect(zoomAt(closest, cursor, 2, limits)).toEqual(closest);
  });
});

describe("panBy", () => {
  // Glisser de 30 px à droite et 10 px vers le haut déplace le canvas d'autant
  it("moves the canvas by the dragged distance", () => {
    const viewport = { scale: 3, offsetX: 100, offsetY: 50 };
    expect(panBy(viewport, 30, -10)).toEqual({ scale: 3, offsetX: 130, offsetY: 40 });
  });
});
