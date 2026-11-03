import { describe, expect, it } from "vitest";
import { DRAFT_CELL, DRAFT_ORIGIN, DRAFT_STROKES, strokePoint, strokeShown } from "./draft-strokes";
import { motifCells, motifSize, type PixelCell } from "./pixel-motifs";

const keyOf = ({ x, y }: PixelCell): string => `${x}.${y}`;
const [CAP, SPOTS, STEM] = DRAFT_STROKES;

// Le plus grand écart, en cases, entre deux cases qui se suivent dans un trait
const longestStep = (cells: readonly PixelCell[]): number =>
  Math.max(
    ...cells
      .slice(1)
      .map((cell, index) =>
        Math.max(Math.abs(cell.x - (cells[index]?.x ?? 0)), Math.abs(cell.y - (cells[index]?.y ?? 0))),
      ),
  );

describe("le champignon de la vignette Annuler, refaire (trois traits)", () => {
  // Les trois traits posés dans l'ordre redonnent le motif de pixel-motifs.ts, case par case et couleur par couleur
  it("gives the mushroom back, cell for cell and color for color, once the three strokes are placed", () => {
    const placed = new Map<string, number>();
    for (const stroke of DRAFT_STROKES)
      for (const cell of stroke.cells) placed.set(keyOf(cell), cell.colorIndex);
    const mushroom = new Map(motifCells("mushroom", 0, 0).map((cell) => [keyOf(cell), cell.colorIndex]));

    expect(placed).toEqual(mushroom);
    expect(DRAFT_STROKES.map(({ name }) => name)).toEqual(["cap", "spots", "stem"]);
    expect(DRAFT_STROKES.map(({ cells }) => cells.length)).toEqual([26, 7, 11]);
  });

  // Chaque trait a sa couleur, et le chapeau est tracé sous les points : le deuxième trait les repose par-dessus
  it("draws the whole cap in one color, the spots over it in another, and the stem in a third", () => {
    expect(new Set(DRAFT_STROKES.map(({ colorIndex }) => colorIndex)).size).toBe(3);
    expect(CAP?.cells.every(({ colorIndex }) => colorIndex === CAP.colorIndex)).toBe(true);
    expect(SPOTS?.cells.every(({ colorIndex }) => colorIndex === SPOTS.colorIndex)).toBe(true);
    expect(STEM?.cells.some(({ colorIndex }) => colorIndex === STEM.colorIndex)).toBe(true);
    const capCells = new Set((CAP?.cells ?? []).map(keyOf));
    expect((SPOTS?.cells ?? []).every((cell) => capCells.has(keyOf(cell)))).toBe(true);
  });

  // La souris suit des cases voisines : le chapeau d'une traite, le reste sans saut de plus de deux cases
  it("moves the mouse from one cell to the next one, with no jump of more than two cells", () => {
    expect(longestStep(CAP?.cells ?? [])).toBe(1);
    expect(longestStep(SPOTS?.cells ?? [])).toBeLessThanOrEqual(2);
    expect(longestStep(STEM?.cells ?? [])).toBeLessThanOrEqual(2);
  });

  // Aussi petit que les motifs des autres vignettes : 7 cases de côté, 3 unités la case, au-dessus de la pill Dessin
  it("is as small as the pixel arts of the other thumbnails, above the draw pill", () => {
    const { width, height } = motifSize("mushroom");

    expect([width, height]).toEqual([7, 7]);
    expect(DRAFT_CELL).toBe(3);
    expect(DRAFT_ORIGIN.x + width * DRAFT_CELL).toBeLessThan(112);
    expect(DRAFT_ORIGIN.y + height * DRAFT_CELL).toBeLessThan(40);
  });

  // Une case se pose quand la souris arrive dessus, et la souris passe par le centre de chaque case
  it("places a cell when the mouse reaches its center", () => {
    for (const stroke of DRAFT_STROKES) {
      const first = stroke.cells[0];
      const last = stroke.cells.at(-1);

      expect(strokeShown(stroke, 0)).toBe(0);
      expect(strokeShown(stroke, 0.0001)).toBe(1);
      expect(strokeShown(stroke, 1)).toBe(stroke.cells.length);
      expect(strokePoint(stroke, 0)).toEqual({
        x: DRAFT_ORIGIN.x + DRAFT_CELL * ((first?.x ?? 0) + 0.5),
        y: DRAFT_ORIGIN.y + DRAFT_CELL * ((first?.y ?? 0) + 0.5),
      });
      expect(strokePoint(stroke, 1)).toEqual({
        x: DRAFT_ORIGIN.x + DRAFT_CELL * ((last?.x ?? 0) + 0.5),
        y: DRAFT_ORIGIN.y + DRAFT_CELL * ((last?.y ?? 0) + 0.5),
      });
    }
  });
});
