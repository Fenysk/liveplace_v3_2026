import { describe, expect, it } from "vitest";
import {
  clampCell,
  fitViewport,
  isArrivalView,
  NO_INSETS,
  panBy,
  panToShow,
  viewportToCell,
  zoomAt,
  zoomLimits,
  zoomPercent,
} from "./viewport";

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

describe("zoomPercent et isArrivalView (CDC 2026, pill Pratique)", () => {
  // Le cadrage de l'arrivée vaut 100 %, et deux fois plus près, 200 %
  it("gives 100% at the arrival framing, and 200% twice as close", () => {
    const arrival = fitViewport(DESKTOP, CANVAS);
    expect(zoomPercent(arrival, DESKTOP, CANVAS)).toBe(100);
    expect(zoomPercent({ ...arrival, scale: arrival.scale * 2 }, DESKTOP, CANVAS)).toBe(200);
    expect(zoomPercent({ ...arrival, scale: arrival.scale / 3 }, DESKTOP, CANVAS)).toBe(33);
  });

  // Sur mobile, Recentrer n'apparaît que quand la vue a bougé depuis l'arrivée
  it("tells whether the view has moved from the arrival framing", () => {
    const arrival = fitViewport(PHONE, CANVAS);
    expect(isArrivalView(arrival, PHONE, CANVAS)).toBe(true);
    // Moins d'un pixel : un arrondi, pas un déplacement
    expect(isArrivalView(panBy(arrival, 0.4, -0.4), PHONE, CANVAS)).toBe(true);
    expect(isArrivalView(panBy(arrival, 12, 0), PHONE, CANVAS)).toBe(false);
    expect(isArrivalView({ ...arrival, scale: arrival.scale * 1.5 }, PHONE, CANVAS)).toBe(false);
  });
});

describe("clampCell (CDC 2026, la case visée au clavier)", () => {
  // Une case hors du canvas revient au bord le plus proche ; une case dedans ne bouge pas
  it("brings a cell outside the canvas back to the nearest edge, and leaves one inside alone", () => {
    expect(clampCell({ x: -3, y: 70 }, { width: 60, height: 45 })).toEqual({ x: 0, y: 44 });
    expect(clampCell({ x: 12, y: 7 }, { width: 60, height: 45 })).toEqual({ x: 12, y: 7 });
  });
});

describe("panToShow (CDC 2026, la vue suit la case visée)", () => {
  const insets = { top: 50, right: 50, bottom: 200, left: 50 };
  const viewport = { scale: 10, offsetX: 0, offsetY: 0 };

  // Une case bien dans l'écran ne bouge pas la vue
  it("leaves the view alone while the cell is well inside the screen", () => {
    expect(panToShow(viewport, { x: 50, y: 30 }, DESKTOP, insets)).toBe(viewport);
  });

  // Près d'un bord, la vue glisse juste assez pour garder la case à la marge
  it("slides the view just enough to keep the cell at the margin", () => {
    expect(panToShow(viewport, { x: 99, y: 30 }, DESKTOP, insets)).toEqual({
      scale: 10,
      offsetX: -50,
      offsetY: 0,
    });
    expect(panToShow(viewport, { x: 2, y: 2 }, DESKTOP, insets)).toEqual({
      scale: 10,
      offsetX: 30,
      offsetY: 30,
    });
  });

  // En bas, la marge garde la case au-dessus de la barre du bas
  it("keeps the cell above the bottom bar", () => {
    expect(panToShow(viewport, { x: 50, y: 65 }, DESKTOP, insets)).toEqual({
      scale: 10,
      offsetX: 0,
      offsetY: -60,
    });
  });
});

// Écart §9.3 (JOURNAL 2026-10-08) : sur mobile, l'arrivée se cadre dans la zone libre entre le haut et le bas des pills.
describe("le cadrage avec des marges (Écart §9.3, JOURNAL 2026-10-08)", () => {
  const FREE_AREA = { top: 130, right: 0, bottom: 70, left: 0 };

  // Sans marges, le cadrage est celui de toujours
  it("frames exactly as before without insets", () => {
    expect(fitViewport(PHONE, CANVAS, NO_INSETS)).toEqual(fitViewport(PHONE, CANVAS));
  });

  // Dans la zone libre, 90 % du côté qui limite, centré dans cette zone et non plus sur tout l'écran
  it("takes 90% of the limiting side of the free area, centered in it rather than on the whole screen", () => {
    const viewport = fitViewport(PHONE, CANVAS, FREE_AREA);
    expect(viewport.scale * 256).toBeCloseTo(351);
    expect(viewport.offsetX).toBeCloseTo(19.5);
    // La zone va de 130 à 774 : son milieu est 452
    expect(viewport.offsetY + (viewport.scale * 256) / 2).toBeCloseTo(452);
    expect(viewport.offsetY).toBeGreaterThan(FREE_AREA.top);
    expect(viewport.offsetY + viewport.scale * 256).toBeLessThan(PHONE.height - FREE_AREA.bottom);
  });

  // Quand c'est la hauteur de la zone libre qui limite, le canvas y tient à 90 %, entre les marges de chaque côté
  it("fits 90% of the free height when the height limits, between the insets on every side", () => {
    const insets = { top: 200, right: 100, bottom: 100, left: 100 };
    const viewport = fitViewport(DESKTOP, CANVAS, insets);
    expect(viewport.scale * 256).toBeCloseTo(450);
    expect(viewport.offsetY).toBeCloseTo(225);
    expect(viewport.offsetX).toBeCloseTo(275);
  });

  // Des marges qui mangent l'écran ne donnent jamais une échelle nulle ou négative
  it("never gives a null or negative scale when the insets eat the whole screen", () => {
    const viewport = fitViewport(PHONE, CANVAS, { top: 500, right: 0, bottom: 500, left: 0 });
    expect(viewport.scale).toBeGreaterThan(0);
    expect(Number.isFinite(viewport.offsetY)).toBe(true);
  });

  // Le 100 % du zoom, le « la vue n'a pas bougé » et le plus petit zoom suivent le même cadrage
  it("measures 100%, the arrival view and the smallest zoom on the same framing", () => {
    const arrival = fitViewport(PHONE, CANVAS, FREE_AREA);
    expect(zoomPercent(arrival, PHONE, CANVAS, FREE_AREA)).toBe(100);
    expect(isArrivalView(arrival, PHONE, CANVAS, FREE_AREA)).toBe(true);
    // Le cadrage sur tout l'écran n'est plus l'arrivée
    expect(isArrivalView(fitViewport(PHONE, CANVAS), PHONE, CANVAS, FREE_AREA)).toBe(false);
    expect(zoomLimits(PHONE, CANVAS, FREE_AREA).minScale).toBeCloseTo(arrival.scale / 2);
  });
});
