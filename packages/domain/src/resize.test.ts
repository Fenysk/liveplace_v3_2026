import { describe, expect, it } from "vitest";
import { type CanvasSize, toStateOffset } from "./index";
import { listCutPixels, planResize, type ResizePlan, targetOf } from "./resize";

// Un rectangle de pixels, bornes incluses : x puis y, comme les exemples validés le 22/10.
type Rect = { x0: number; x1: number; y0: number; y1: number; colorIndex: number };

const rect = (x0: number, x1: number, y0: number, y1: number, colorIndex: number): Rect => ({
  x0,
  x1,
  y0,
  y1,
  colorIndex,
});

const stateOf = ({ width, height }: CanvasSize, ...rects: Rect[]): Uint8Array => {
  const state = new Uint8Array(width * height);
  for (const { x0, x1, y0, y1, colorIndex } of rects)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) state[toStateOffset(x, y, width)] = colorIndex;
  return state;
};

// L'image après le plan : ce que montre le cadre `to`, et ce qui en sort (gardé hors du cadre).
const render = (plan: ResizePlan, state: Uint8Array) => {
  const shown = new Uint8Array(plan.to.width * plan.to.height);
  for (let y = 0; y < plan.from.height; y++)
    for (let x = 0; x < plan.from.width; x++) {
      const colorIndex = state[toStateOffset(x, y, plan.from.width)] ?? 0;
      const target = targetOf(plan, x, y);
      if (colorIndex === 0 || !target) continue;
      if (target.x < plan.to.width && target.y < plan.to.height)
        shown[toStateOffset(target.x, target.y, plan.to.width)] = colorIndex;
    }
  return shown;
};

// Une ligne de texte par ligne de la fresque : un échec montre l'image, pas deux tableaux d'octets.
const show = (state: Uint8Array, width: number): string =>
  Array.from({ length: state.length / width }, (_, y) =>
    Array.from(state.slice(y * width, (y + 1) * width), (colorIndex) =>
      colorIndex === 0 ? "." : String(colorIndex),
    ).join(""),
  ).join("\n");

const size = (width: number, height: number): CanvasSize => ({ width, height });

// Le plan d'un état peint, et l'image qu'il donne.
const resize = (from: CanvasSize, to: CanvasSize, ...rects: Rect[]) => {
  const state = stateOf(from, ...rects);
  const plan = planResize(state, from, to);
  return { state, plan, shown: show(render(plan, state), to.width) };
};

const picture = (to: CanvasSize, ...rects: Rect[]): string => show(stateOf(to, ...rects), to.width);

describe("planResize : les exemples validés (Écart §5.3, JOURNAL 2026-10-24)", () => {
  // E1 : le vide entre deux dessins se resserre, le bord bas se coupe sans rien bouger
  it("E1 : 16×8 → 8×4 closes the void between two drawings and trims the empty bottom", () => {
    const { plan, shown } = resize(size(16, 8), size(8, 4), rect(0, 2, 0, 2, 1), rect(13, 15, 0, 2, 2));

    expect(shown).toBe(picture(size(8, 4), rect(0, 2, 0, 2, 1), rect(5, 7, 0, 2, 2)));
    expect(plan.hasMovedPixels).toBe(true);
    expect(listCutPixels(plan, stateOf(size(16, 8), rect(0, 2, 0, 2, 1), rect(13, 15, 0, 2, 2)))).toEqual([]);
  });

  // E2 : le plus grand vide se resserre d'abord, l'espace entre deux lettres ne bouge pas
  it("E2 : 20×4 → 14×4 narrows the biggest void first, so the space between two letters stays", () => {
    const { shown } = resize(
      size(20, 4),
      size(14, 4),
      rect(1, 2, 1, 2, 1),
      rect(5, 6, 1, 2, 2),
      rect(16, 18, 1, 2, 3),
    );

    expect(shown).toBe(picture(size(14, 4), rect(1, 2, 1, 2, 1), rect(5, 6, 1, 2, 2), rect(11, 13, 1, 2, 3)));
  });

  // E3 : le bord droit et bas d'abord, puis le bord gauche et haut descend jusqu'au dessin
  it("E3 : 12×8 → 6×4 trims the right and bottom edges, then brings the drawing toward the origin", () => {
    const { plan, shown } = resize(size(12, 8), size(6, 4), rect(6, 8, 4, 5, 1));

    expect(shown).toBe(picture(size(6, 4), rect(3, 5, 2, 3, 1)));
    expect(plan.hasMovedPixels).toBe(true);
    expect(targetOf(plan, 6, 4)).toEqual({ x: 3, y: 2 });
  });

  // E4 : sans colonne vide, chaque bande séparée par une ligne vide se rapproche de son côté
  it("E4 : 12×6 → 8×6 brings each band of rows closer by itself when no column is empty", () => {
    const { shown } = resize(size(12, 6), size(8, 6), rect(0, 6, 0, 1, 1), rect(5, 11, 4, 5, 2));

    expect(shown).toBe(picture(size(8, 6), rect(0, 6, 0, 1, 1), rect(1, 7, 4, 5, 2)));
  });

  // E4 bis : la hauteur fait pareil avec les colonnes
  it("E4 bis : 6×12 → 6×8 brings each band of columns closer by itself when no row is empty", () => {
    const { shown } = resize(size(6, 12), size(6, 8), rect(0, 1, 0, 6, 1), rect(4, 5, 5, 11, 2));

    expect(shown).toBe(picture(size(6, 8), rect(0, 1, 0, 6, 1), rect(4, 5, 1, 7, 2)));
  });

  // E5 : trop large, on rapproche au maximum puis ce qui dépasse est coupé, et reste dans les piles hors du cadre
  it("E5 : 22×4 → 12×4 brings the drawings as close as possible, then cuts what is left over", () => {
    const from = size(22, 4);
    const rects = [rect(0, 3, 1, 2, 1), rect(12, 15, 1, 2, 2), rect(17, 20, 1, 2, 3)];
    const { state, plan, shown } = resize(from, size(12, 4), ...rects);

    expect(shown).toBe(picture(size(12, 4), rect(0, 3, 1, 2, 1), rect(5, 8, 1, 2, 2), rect(10, 11, 1, 2, 3)));
    expect(targetOf(plan, 19, 1)).toEqual({ x: 12, y: 1 });
    expect(targetOf(plan, 20, 2)).toEqual({ x: 13, y: 2 });
    expect(listCutPixels(plan, state)).toEqual([
      { x: 19, y: 1, colorIndex: 3 },
      { x: 20, y: 1, colorIndex: 3 },
      { x: 19, y: 2, colorIndex: 3 },
      { x: 20, y: 2, colorIndex: 3 },
    ]);
  });

  // E6 : agrandir ne bouge rien, le vide s'ajoute à droite et en bas
  it("E6 : growing an 8×4 canvas back to 16×8 moves nothing", () => {
    const rects = [rect(0, 2, 0, 2, 1), rect(5, 7, 0, 2, 2)];
    const { plan, shown } = resize(size(8, 4), size(16, 8), ...rects);

    expect(shown).toBe(picture(size(16, 8), ...rects));
    expect(plan.hasMovedPixels).toBe(false);
    expect(targetOf(plan, 5, 1)).toEqual({ x: 5, y: 1 });
  });
});

describe("planResize : les cas limites", () => {
  // Une fresque vide : rien ne bouge, que la taille change
  it("moves nothing on an empty canvas", () => {
    const { plan } = resize(size(20, 10), size(5, 5));

    expect(plan.hasMovedPixels).toBe(false);
    expect(targetOf(plan, 19, 9)).toEqual({ x: 19, y: 9 });
    expect(targetOf(plan, 3, 2)).toEqual({ x: 3, y: 2 });
  });

  // Une seule dimension qui rétrécit : l'autre axe ne bouge jamais
  it("shrinks one dimension alone: the other axis never moves", () => {
    const wide = resize(size(10, 3), size(6, 3), rect(0, 1, 0, 2, 1), rect(7, 8, 0, 2, 2));
    const tall = resize(size(3, 10), size(3, 6), rect(0, 2, 0, 1, 1), rect(0, 2, 7, 8, 2));

    expect(wide.shown).toBe(picture(size(6, 3), rect(0, 1, 0, 2, 1), rect(4, 5, 0, 2, 2)));
    expect(tall.shown).toBe(picture(size(3, 6), rect(0, 2, 0, 1, 1), rect(0, 2, 4, 5, 2)));
    expect(wide.plan.height.maps).toEqual([]);
    expect(tall.plan.width.maps).toEqual([]);
  });

  // À égalité de vides, le plus à droite se resserre d'abord : moins de pixels bougent
  it("narrows the rightmost void first when two voids are equal", () => {
    const { shown } = resize(
      size(12, 1),
      size(10, 1),
      rect(0, 0, 0, 0, 1),
      rect(4, 4, 0, 0, 2),
      rect(8, 11, 0, 0, 3),
    );

    expect(shown).toBe(picture(size(10, 1), rect(0, 0, 0, 0, 1), rect(3, 3, 0, 0, 2), rect(6, 9, 0, 0, 3)));
  });

  // Un vide entre deux dessins garde toujours une colonne ; le bord gauche peut descendre à zéro
  it("keeps at least one column between two drawings, while the left edge can reach zero", () => {
    const tight = resize(size(4, 1), size(2, 1), rect(0, 0, 0, 0, 1), rect(2, 2, 0, 0, 2));
    const flush = resize(size(10, 1), size(2, 1), rect(5, 6, 0, 0, 1));

    expect(tight.shown).toBe(picture(size(2, 1), rect(0, 0, 0, 0, 1)));
    expect(listCutPixels(tight.plan, tight.state)).toEqual([{ x: 2, y: 0, colorIndex: 2 }]);
    expect(flush.shown).toBe(picture(size(2, 1), rect(0, 1, 0, 0, 1)));
  });

  // Rien n'est jamais coupé tant qu'il reste une colonne vide à retirer, et un dessin trop grand est coupé sans bouger
  it("cuts a drawing bigger than the frame without moving it", () => {
    const { state, plan } = resize(size(10, 10), size(4, 4), rect(0, 9, 0, 9, 1));

    expect(plan.hasMovedPixels).toBe(false);
    expect(listCutPixels(plan, state)).toHaveLength(100 - 16);
    expect(targetOf(plan, 7, 7)).toEqual({ x: 7, y: 7 });
  });

  // Les deux dimensions rétrécissent : la largeur d'abord, la hauteur sur le résultat
  it("shrinks the width first, then the height on the result", () => {
    const { shown } = resize(size(14, 10), size(8, 5), rect(1, 2, 1, 2, 1), rect(11, 12, 7, 8, 2));

    expect(shown).toBe(picture(size(8, 5), rect(1, 2, 0, 1, 1), rect(6, 7, 3, 4, 2)));
  });

  // Agrandir une dimension et réduire l'autre : seule la dimension qui rétrécit rapproche
  it("grows one dimension and shrinks the other: only the shrinking one brings drawings closer", () => {
    const { plan, shown } = resize(size(6, 6), size(10, 3), rect(1, 2, 4, 5, 1));

    expect(shown).toBe(picture(size(10, 3), rect(1, 2, 1, 2, 1)));
    expect(plan.width.maps).toEqual([]);
    const reversed = resize(size(6, 6), size(3, 10), rect(4, 5, 1, 2, 1));
    expect(reversed.shown).toBe(picture(size(3, 10), rect(1, 2, 1, 2, 1)));
  });

  // Une bande qui tient est rapprochée, celle qui ne tient pas est coupée, chacune de son côté
  it("brings a band that fits closer and cuts the band that does not, each by itself", () => {
    const from = size(12, 5);
    const rects = [rect(0, 1, 0, 0, 1), rect(9, 10, 0, 0, 2), rect(0, 5, 3, 3, 3), rect(7, 10, 3, 3, 4)];
    const { state, plan, shown } = resize(from, size(8, 5), ...rects);

    expect(shown).toBe(
      picture(size(8, 5), rect(0, 1, 0, 0, 1), rect(6, 7, 0, 0, 2), rect(0, 5, 3, 3, 3), rect(7, 7, 3, 3, 4)),
    );
    expect(listCutPixels(plan, state)).toEqual([
      { x: 8, y: 3, colorIndex: 4 },
      { x: 9, y: 3, colorIndex: 4 },
      { x: 10, y: 3, colorIndex: 4 },
    ]);
  });

  // Le plan ne touche pas à l'état qu'on lui donne
  it("leaves the state it is given untouched", () => {
    const state = stateOf(size(8, 2), rect(6, 7, 0, 1, 1));
    const before = Array.from(state);

    planResize(state, size(8, 2), size(3, 2));

    expect(Array.from(state)).toEqual(before);
  });

  // Une grille qui n'a pas la taille de `from` est une erreur de l'appelant
  it("refuses a state that is not the size of the canvas", () => {
    expect(() => planResize(new Uint8Array(5), size(4, 4), size(2, 2))).toThrow();
  });
});

// Un générateur à graine : les fresques au hasard sont les mêmes à chaque lancement.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

describe("planResize : les garanties, sur des fresques au hasard", () => {
  const next = seeded(20261024);
  const cases = Array.from({ length: 120 }, () => {
    const from = size(2 + Math.floor(next() * 30), 2 + Math.floor(next() * 30));
    const to = size(1 + Math.floor(next() * 36), 1 + Math.floor(next() * 36));
    const density = next() * 0.25;
    const state = new Uint8Array(from.width * from.height);
    // Des blocs plutôt que des points : les vides entre dessins existent vraiment.
    const blocks = 1 + Math.floor(next() * 6);
    for (let block = 0; block < blocks; block++) {
      const x0 = Math.floor(next() * from.width);
      const y0 = Math.floor(next() * from.height);
      const w = 1 + Math.floor(next() * 4);
      const h = 1 + Math.floor(next() * 4);
      for (let y = y0; y < Math.min(from.height, y0 + h); y++)
        for (let x = x0; x < Math.min(from.width, x0 + w); x++)
          if (next() > density) state[toStateOffset(x, y, from.width)] = 1 + block;
    }
    return { from, to, state, plan: planResize(state, from, to) };
  });

  // Une case ne va jamais plus loin de l'origine, et deux cases n'arrivent jamais au même endroit
  it("never pushes a cell away from the origin, and never sends two cells to the same place", () => {
    for (const { from, plan } of cases) {
      const seen = new Set<number>();
      for (let y = 0; y < from.height; y++)
        for (let x = 0; x < from.width; x++) {
          const target = targetOf(plan, x, y);
          if (!target) continue;
          expect(target.x).toBeLessThanOrEqual(x);
          expect(target.y).toBeLessThanOrEqual(y);
          const key = target.y * 1000 + target.x;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
    }
  });

  // Seules des cases vides sont retirées : aucun pixel posé n'est perdu
  it("only drops empty cells: no placed pixel is ever lost", () => {
    for (const { from, state, plan } of cases)
      for (let y = 0; y < from.height; y++)
        for (let x = 0; x < from.width; x++)
          if (state[toStateOffset(x, y, from.width)] !== 0) expect(targetOf(plan, x, y)).not.toBeNull();
  });

  // Un dessin n'est jamais coupé ni déformé : deux pixels voisins le restent
  it("never deforms a drawing: two neighboring pixels stay neighbors", () => {
    for (const { from, state, plan } of cases)
      for (let y = 0; y < from.height; y++)
        for (let x = 0; x < from.width; x++) {
          if (state[toStateOffset(x, y, from.width)] === 0) continue;
          const here = targetOf(plan, x, y);
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
            [1, 1],
            [-1, 1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= from.width || ny >= from.height) continue;
            if (state[toStateOffset(nx, ny, from.width)] === 0) continue;
            const there = targetOf(plan, nx, ny);
            expect(there).toEqual({ x: (here?.x ?? 0) + dx, y: (here?.y ?? 0) + dy });
          }
        }
  });

  // Agrandir une dimension ne rapproche rien sur son axe
  it("never moves anything along an axis that does not shrink", () => {
    for (const { from, to, state, plan } of cases)
      for (let y = 0; y < from.height; y++)
        for (let x = 0; x < from.width; x++) {
          if (state[toStateOffset(x, y, from.width)] === 0) continue;
          const target = targetOf(plan, x, y);
          if (to.width >= from.width) expect(target?.x).toBe(x);
          if (to.height >= from.height) expect(target?.y).toBe(y);
        }
  });

  // Un pixel qui change de case se dit : hasMovedPixels est vrai exactement alors
  it("says hasMovedPixels exactly when a placed pixel changes cell", () => {
    for (const { from, state, plan } of cases) {
      let hasMoved = false;
      for (let y = 0; y < from.height; y++)
        for (let x = 0; x < from.width; x++) {
          if (state[toStateOffset(x, y, from.width)] === 0) continue;
          const target = targetOf(plan, x, y);
          if (target?.x !== x || target.y !== y) hasMoved = true;
        }
      expect(plan.hasMovedPixels).toBe(hasMoved);
    }
  });
});
