import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Pixel } from "./canvas-store";
import {
  BATCH_MAX,
  type Draft,
  type DraftContext,
  EMPTY_DRAFT,
  settleBatch,
  toBatches,
  toggleDraftCell,
  traceDraftCells,
} from "./draft";

const ERASER = 0;
// (5, 5) est transparent sur le canvas, tout le reste porte la couleur 9.
const context = (charges: number): DraftContext => ({
  charges,
  colorIndexAt: (x, y) => (x === 5 && y === 5 ? 0 : 9),
});

const draftOf = (...pixels: Pixel[]): Draft =>
  new Map(pixels.map((pixel) => [toCellKey(pixel.x, pixel.y), pixel]));

const pixelsOf = (draft: Draft) => [...draft.values()];

describe("toggleDraftCell (CDC 2026, un clic ou un tap)", () => {
  // Ajoute la case avec la couleur active
  it("adds the cell with the active color", () => {
    const edit = toggleDraftCell(EMPTY_DRAFT, { x: 1, y: 2, colorIndex: 4 }, context(10));

    expect(pixelsOf(edit.draft)).toEqual([{ x: 1, y: 2, colorIndex: 4 }]);
    expect(edit.isCapped).toBe(false);
  });

  // Retire une case du brouillon quelle que soit la couleur active, et un nouveau clic la rajoute avec la couleur active
  it("drops a draft cell whatever the active color, and a new click adds it back with the active color", () => {
    const draft = draftOf({ x: 1, y: 2, colorIndex: 4 });

    const dropped = toggleDraftCell(draft, { x: 1, y: 2, colorIndex: 7 }, context(10));
    expect(pixelsOf(dropped.draft)).toEqual([]);

    const added = toggleDraftCell(dropped.draft, { x: 1, y: 2, colorIndex: 7 }, context(10));
    expect(pixelsOf(added.draft)).toEqual([{ x: 1, y: 2, colorIndex: 7 }]);
  });

  // N'ajoute rien au-delà des charges, et le signale ; retirer reste possible
  it("adds nothing past the charges and says so, while dropping still works", () => {
    const draft = draftOf({ x: 0, y: 0, colorIndex: 4 }, { x: 1, y: 0, colorIndex: 4 });

    const capped = toggleDraftCell(draft, { x: 2, y: 0, colorIndex: 4 }, context(2));
    expect(capped).toEqual({ draft, isCapped: true });

    const dropped = toggleDraftCell(draft, { x: 1, y: 0, colorIndex: 4 }, context(2));
    expect(dropped.draft.size).toBe(1);
    expect(dropped.isCapped).toBe(false);
  });

  // Ignore la gomme sur un pixel transparent, sans vibrer, et la garde sur un pixel coloré
  it("ignores the eraser on a transparent pixel without shaking, and keeps it on a colored one", () => {
    const ignored = toggleDraftCell(EMPTY_DRAFT, { x: 5, y: 5, colorIndex: ERASER }, context(10));
    expect(ignored).toEqual({ draft: EMPTY_DRAFT, isCapped: false });

    const erased = toggleDraftCell(EMPTY_DRAFT, { x: 6, y: 5, colorIndex: ERASER }, context(10));
    expect(pixelsOf(erased.draft)).toEqual([{ x: 6, y: 5, colorIndex: ERASER }]);
  });
});

describe("traceDraftCells (CDC 2026, le tracé)", () => {
  // Ajoute les cases dans l'ordre, et ignore celles déjà dans le brouillon : ni retrait, ni recoloration
  it("adds the cells in order, and skips those already in the draft: neither dropped nor recolored", () => {
    const draft = draftOf({ x: 1, y: 0, colorIndex: 4 });

    const edit = traceDraftCells(
      draft,
      [
        { x: 0, y: 0, colorIndex: 7 },
        { x: 1, y: 0, colorIndex: 7 },
        { x: 2, y: 0, colorIndex: 7 },
      ],
      context(10),
    );

    expect(pixelsOf(edit.draft)).toEqual([
      { x: 1, y: 0, colorIndex: 4 },
      { x: 0, y: 0, colorIndex: 7 },
      { x: 2, y: 0, colorIndex: 7 },
    ]);
    expect(edit.isCapped).toBe(false);
  });

  // S'arrête au plafond et le signale
  it("stops at the cap and says so", () => {
    const cells = [0, 1, 2, 3].map((x) => ({ x, y: 0, colorIndex: 7 }));

    const edit = traceDraftCells(EMPTY_DRAFT, cells, context(2));

    expect(pixelsOf(edit.draft)).toEqual(cells.slice(0, 2));
    expect(edit.isCapped).toBe(true);
  });

  // Passe la gomme sur un pixel transparent sans s'arrêter
  it("goes over a transparent pixel with the eraser without stopping", () => {
    const edit = traceDraftCells(
      EMPTY_DRAFT,
      [
        { x: 5, y: 5, colorIndex: ERASER },
        { x: 6, y: 5, colorIndex: ERASER },
      ],
      context(10),
    );

    expect(pixelsOf(edit.draft)).toEqual([{ x: 6, y: 5, colorIndex: ERASER }]);
  });
});

describe("batches (§4.2, §6.3)", () => {
  const draft = draftOf(...Array.from({ length: 130 }, (_, x) => ({ x, y: 0, colorIndex: 4 })));

  // Découpe en lots de 64 au plus, dans l'ordre du brouillon
  it("cuts the draft into batches of at most 64, in draft order", () => {
    const batches = toBatches(draft);

    expect(BATCH_MAX).toBe(64);
    expect(batches.map((batch) => batch.length)).toEqual([64, 64, 2]);
    expect(batches[1]?.[0]).toEqual({ x: 64, y: 0, colorIndex: 4 });
  });

  // Sort les acceptés du brouillon, garde les refusés, et lit l'index d'un refus comme sa place dans le lot
  it("takes the accepted out of the draft, keeps the rejected, and reads a refusal index as its place in the batch", () => {
    const second = toBatches(draft)[1] ?? [];

    const settled = settleBatch(draft, second, { rejected: [{ index: 1, reason: "gauge" }] });

    expect(settled.size).toBe(130 - 63);
    expect(settled.has(toCellKey(65, 0))).toBe(true);
    expect(settled.has(toCellKey(64, 0))).toBe(false);
    expect(settled.has(toCellKey(1, 0))).toBe(true);
  });
});
