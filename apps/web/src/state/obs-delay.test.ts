import type { BroadcastCell, CellsFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createObsQueue, nextShowAt, queueCells, queueRecent, showDueCells } from "./obs-delay";

// Un canvas de 4 × 4, une case suivie : (1, 2), à l'offset 9.
const WIDTH = 4;
const OFFSET = 9;
const DELAY = 10_000;
const t0 = 1_700_000_000_000;

type CellOptions = { colorIndex: number; previousColorIndex?: number; placedAt: number; version: number };

const place = ({ colorIndex, previousColorIndex = 0, placedAt, version }: CellOptions): BroadcastCell => ({
  x: 1,
  y: 2,
  colorIndex,
  previousColorIndex,
  placedAt,
  version,
  kind: "place",
});
const clear = (options: CellOptions): BroadcastCell => ({ ...place(options), kind: "clear" });
const frameOf = (...cells: BroadcastCell[]): CellsFrame => ({ toVersion: cells.at(-1)?.version ?? 0, cells });

// Une file sur un snapshot où la case suivie montre la couleur 3.
const queueOnThree = () => {
  const shown = new Uint8Array(WIDTH * 4);
  shown[OFFSET] = 3;
  return createObsQueue(WIDTH, shown);
};

describe("the OBS queue (§9.5, JOURNAL 2026-09-25)", () => {
  // Règle 1 : une pose attend son délai, l'ancienne couleur reste visible jusque-là
  it("rule 1: a placement waits for its delay, the old color staying visible until then", () => {
    const queue = queueOnThree();

    queueCells(
      queue,
      frameOf(place({ colorIndex: 5, previousColorIndex: 3, placedAt: t0, version: 10 })),
      t0,
      DELAY,
    );
    showDueCells(queue, t0 + DELAY - 1, DELAY);
    expect(queue.shown[OFFSET]).toBe(3);

    expect(nextShowAt(queue, DELAY)).toBe(t0 + DELAY);
    showDueCells(queue, t0 + DELAY, DELAY);
    expect(queue.shown[OFFSET]).toBe(5);
    expect(nextShowAt(queue, DELAY)).toBeNull();
  });

  // Règle 2 : un pixel retiré pendant son délai n'apparaît jamais, le pixel du dessous reste
  it("rule 2: a pixel cleared during its delay never shows, and the pixel below stays", () => {
    const queue = queueOnThree();

    queueCells(
      queue,
      frameOf(place({ colorIndex: 5, previousColorIndex: 3, placedAt: t0, version: 10 })),
      t0,
      DELAY,
    );
    queueCells(
      queue,
      frameOf(clear({ colorIndex: 3, previousColorIndex: 5, placedAt: t0 - 60_000, version: 11 })),
      t0 + 3000,
      DELAY,
    );
    showDueCells(queue, t0 + 60_000, DELAY);

    expect(queue.shown[OFFSET]).toBe(3);
  });

  // Règle 2 : retirer un pixel montré depuis longtemps fait revenir tout de suite celui du dessous
  it("rule 2: clearing a pixel shown long ago brings the one below back at once", () => {
    const shown = new Uint8Array(WIDTH * 4);
    shown[OFFSET] = 5;
    const queue = createObsQueue(WIDTH, shown);

    queueCells(
      queue,
      frameOf(clear({ colorIndex: 3, previousColorIndex: 5, placedAt: t0 - 60_000, version: 11 })),
      t0,
      DELAY,
    );

    expect(queue.shown[OFFSET]).toBe(3);
  });

  // Règle 2 : un pixel revenu encore dans son délai laisse la case vide, puis paraît à son heure
  it("rule 2: a restored pixel still within its delay leaves the cell empty, then shows at its own time", () => {
    const queue = queueOnThree();

    queueCells(queue, frameOf(place({ colorIndex: 4, placedAt: t0, version: 10 })), t0, DELAY);
    queueCells(queue, frameOf(place({ colorIndex: 5, placedAt: t0 + 2000, version: 11 })), t0 + 2000, DELAY);
    queueCells(
      queue,
      frameOf(clear({ colorIndex: 4, previousColorIndex: 5, placedAt: t0, version: 12 })),
      t0 + 3000,
      DELAY,
    );

    expect(queue.shown[OFFSET]).toBe(0);
    showDueCells(queue, t0 + DELAY, DELAY);
    expect(queue.shown[OFFSET]).toBe(4);
    showDueCells(queue, t0 + 60_000, DELAY);
    expect(queue.shown[OFFSET]).toBe(4);
  });

  // Sans délai, tout paraît aussitôt
  it("shows everything at once without a delay", () => {
    const queue = queueOnThree();

    queueCells(queue, frameOf(place({ colorIndex: 5, placedAt: t0, version: 10 })), t0, 0);
    showDueCells(queue, t0, 0);

    expect(queue.shown[OFFSET]).toBe(5);
  });

  // Le délai du moment décide : allongé, ce qui attend attend plus ; raccourci, ce qui est dû paraît
  it("follows the delay of the moment: longer, waiting cells wait more; shorter, due cells show", () => {
    const queue = queueOnThree();
    queueCells(queue, frameOf(place({ colorIndex: 5, placedAt: t0, version: 10 })), t0, DELAY);

    showDueCells(queue, t0 + DELAY, 60_000);
    expect(queue.shown[OFFSET]).toBe(3);
    expect(nextShowAt(queue, 60_000)).toBe(t0 + 60_000);

    showDueCells(queue, t0 + DELAY, 5000);
    expect(queue.shown[OFFSET]).toBe(5);
  });

  // Deux poses sur la case : la dernière l'emporte, chacune à son heure
  it("lets the last of two placements on a cell win, each at its own time", () => {
    const queue = queueOnThree();

    queueCells(
      queue,
      frameOf(
        place({ colorIndex: 4, placedAt: t0, version: 10 }),
        place({ colorIndex: 5, placedAt: t0 + 1000, version: 11 }),
      ),
      t0 + 1000,
      DELAY,
    );
    showDueCells(queue, t0 + DELAY, DELAY);
    expect(queue.shown[OFFSET]).toBe(4);
    showDueCells(queue, t0 + DELAY + 1000, DELAY);
    expect(queue.shown[OFFSET]).toBe(5);
  });

  // Règle 3 : après un rechargement, ce qui attendait attend encore, et ce qui a été retiré ne paraît jamais
  it("rule 3: after a reload, what was waiting still waits, and what was cleared never shows", () => {
    // Le snapshot montre déjà l'état réel : la case 9 à 3 (le troll retiré), la case 10 à 6 (posée il y a 4 s).
    const shown = new Uint8Array(WIDTH * 4);
    shown[OFFSET] = 3;
    shown[OFFSET + 1] = 6;
    const queue = createObsQueue(WIDTH, shown);
    const troll = place({ colorIndex: 5, previousColorIndex: 3, placedAt: t0 - 6000, version: 10 });
    const cleared = clear({ colorIndex: 3, previousColorIndex: 5, placedAt: t0 - 60_000, version: 11 });
    const neighbour: BroadcastCell = { ...place({ colorIndex: 6, placedAt: t0 - 4000, version: 12 }), x: 2 };

    queueRecent(queue, frameOf(troll, cleared, neighbour), t0, DELAY);
    expect(queue.shown[OFFSET]).toBe(3);
    expect(queue.shown[OFFSET + 1]).toBe(0);

    showDueCells(queue, t0 + 6000, DELAY);
    expect(queue.shown[OFFSET]).toBe(3);
    expect(queue.shown[OFFSET + 1]).toBe(6);
  });
});
