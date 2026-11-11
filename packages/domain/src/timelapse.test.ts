import type { Event } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import type { ChunkEntry } from "./chunk";
import { type CanvasCorner, toCellKey } from "./index";
import type { PileEntry, Tombstones } from "./snapshot";
import { createTimelapseBuilder, type Timelapse, type TimelapseFrame, type TimelapsePile } from "./timelapse";

const AT = 1_000_000;
const NO_TOMBSTONES: Tombstones = {
  clearedVersions: new Map(),
  clearedPlacements: new Set(),
  clearedRanges: new Map(),
};

type Cell = [x: number, y: number, colorIndex: number, previousColorIndex?: number];

const eventOf = (version: number, kind: Event["kind"], authorId: string, cells: Cell[]): Event => ({
  version,
  kind,
  authorId,
  occurredAt: AT + version,
  cells: cells.map(([x, y, colorIndex, previousColorIndex = 0]) => ({
    x,
    y,
    colorIndex,
    previousColorIndex,
    placedAt: AT + version,
  })),
});

const place = (version: number, authorId: string, placementId: string, cells: Cell[]): ChunkEntry => [
  version,
  placementId,
  eventOf(version, "place", authorId, cells),
];

const clear = (version: number, cells: Cell[]): ChunkEntry => [
  version,
  null,
  eventOf(version, "clear", "owner", cells),
];

const hide = (version: number, cells: Cell[]): ChunkEntry => [
  version,
  null,
  eventOf(version, "hide", "owner", cells),
];

// Une entrée de pile dans le cadre d'aujourd'hui.
const entryOf = (version: number, authorId: string, placementId: string, colorIndex: number): PileEntry => ({
  authorId,
  colorIndex,
  placedAt: AT + version,
  version,
  placementId,
});

const pileAt = (x: number, y: number, ...entries: PileEntry[]): TimelapsePile => ({
  cellKey: toCellKey(x, y),
  entries,
});

const stateOf = (width: number, height: number, cells: [x: number, y: number, colorIndex: number][]) => {
  const state = new Uint8Array(width * height);
  for (const [x, y, colorIndex] of cells) state[y * width + x] = colorIndex;
  return state;
};

type Scene = {
  width: number;
  height: number;
  cells: [x: number, y: number, colorIndex: number][];
  corner?: CanvasCorner;
  piles?: TimelapsePile[];
  tombstones?: Tombstones;
  maxVersion?: number;
  entries: ChunkEntry[];
  maxChanges?: number;
};

const build = ({
  width,
  height,
  cells,
  corner = { x: 0, y: 0 },
  piles = [],
  tombstones = NO_TOMBSTONES,
  ...rest
}: Scene) => {
  const state = stateOf(width, height, cells);
  const frame: TimelapseFrame = {
    size: { width, height },
    corner,
    state,
    maxVersion: rest.maxVersion ?? 1_000,
    piles,
    tombstones,
  };
  const builder = createTimelapseBuilder(frame, rest.maxChanges);
  for (const entry of rest.entries) builder.add(entry);
  return { state, result: builder.finish(), builder };
};

const timelapseOf = (scene: Scene): Timelapse & { state: Uint8Array } => {
  const { state, result } = build(scene);
  if (!result.ok) throw new Error(result.error);
  return { ...result.value, state };
};

// Ce que montre la dernière image : l'état de départ, puis chaque changement dans l'ordre.
const replayed = ({ initial, changes }: Timelapse): Uint8Array => {
  const shown = initial.slice();
  for (const packed of changes) shown[packed >>> 8] = packed & 0xff;
  return shown;
};

const changesOf = ({ changes }: Timelapse, width: number): [x: number, y: number, colorIndex: number][] =>
  Array.from(changes, (packed): [number, number, number] => [
    (packed >>> 8) % width,
    Math.floor((packed >>> 8) / width),
    packed & 0xff,
  ]);

describe("a timelapse of a fresque that grew to the left (§5.8)", () => {
  // Quand la fresque a grandi de 3 cases à gauche, le système doit poser une pose d'avant à sa place d'aujourd'hui, par sa pile.
  it("places a pose from before the growth where its pile says it is today", () => {
    const scene: Scene = {
      width: 13,
      height: 10,
      cells: [
        [4, 1, 3],
        [5, 1, 4],
      ],
      piles: [pileAt(4, 1, entryOf(1, "a", "pa000001", 3)), pileAt(5, 1, entryOf(2, "b", "pb000002", 4))],
      entries: [place(1, "a", "pa000001", [[1, 1, 3]]), place(2, "b", "pb000002", [[5, 1, 4]])],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 13)).toEqual([
      [4, 1, 3],
      [5, 1, 4],
    ]);
    expect(Array.from(timelapse.initial)).toEqual(new Array(130).fill(0));
  });

  // Quand les piles gardent leur clé de grille et que le coin du cadre a reculé de 3, alors chaque pose se place par le coin.
  it("places a pose by the corner of the frame when the piles keep their grid keys", () => {
    const scene: Scene = {
      width: 13,
      height: 10,
      corner: { x: -3, y: 0 },
      cells: [
        [4, 1, 3],
        [5, 1, 4],
      ],
      piles: [pileAt(1, 1, entryOf(1, "a", "pa000001", 3)), pileAt(2, 1, entryOf(2, "b", "pb000002", 4))],
      entries: [place(1, "a", "pa000001", [[1, 1, 3]]), place(2, "b", "pb000002", [[2, 1, 4]])],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 13)).toEqual([
      [4, 1, 3],
      [5, 1, 4],
    ]);
    expect(replayed(timelapse)).toEqual(timelapse.state);
  });

  // Si une pose a été recouverte au point que sa pile l'a oubliée, alors elle prend le décalage de la pose la plus proche.
  it("gives a buried pose the shift of the nearest pose that has one", () => {
    const scene: Scene = {
      width: 13,
      height: 10,
      cells: [
        [4, 1, 3],
        [8, 8, 6],
      ],
      piles: [pileAt(4, 1, entryOf(1, "a", "pa000001", 3)), pileAt(8, 8, entryOf(4, "c", "pc000004", 6))],
      // La pose 2 n'a plus d'entrée de pile : elle prend le décalage de 3 de la pose 1, plus proche que la 4.
      entries: [
        place(1, "a", "pa000001", [[1, 1, 3]]),
        place(2, "b", "pb000002", [[2, 2, 5]]),
        place(4, "c", "pc000004", [[8, 8, 6]]),
      ],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 13)).toContainEqual([5, 2, 5]);
    expect(replayed(timelapse)).toEqual(timelapse.state);
  });

  // Quand plusieurs décalages se valent (une seule entrée de pile, des cases de la même couleur), le décalage du voisin tranche.
  it("breaks a tie between shifts with the shift of the nearest decided pose", () => {
    const scene: Scene = {
      width: 20,
      height: 10,
      cells: [
        [4, 1, 3],
        [13, 5, 2],
      ],
      piles: [pileAt(4, 1, entryOf(1, "a", "pa000001", 3)), pileAt(13, 5, entryOf(2, "b", "pb000002", 2))],
      // Pose 2 : deux cases de la même couleur, une seule entrée de pile (en 13, 5) : 12 ou 3 de décalage ?
      entries: [
        place(1, "a", "pa000001", [[1, 1, 3]]),
        place(2, "b", "pb000002", [
          [10, 5, 2],
          [1, 5, 2],
        ]),
      ],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 20)).toContainEqual([13, 5, 2]);
  });
});

describe("the moderation of a timelapse (D-16)", () => {
  const cleared = (patch: Partial<Tombstones>): Tombstones => ({ ...NO_TOMBSTONES, ...patch });

  // Si une pose est effacée par la modération, alors elle ne doit jamais être visible, quelle que soit la pierre tombale.
  it.each([
    ["by its placement", cleared({ clearedPlacements: new Set(["bad:pbad00001"]) })],
    ["by its author up to a version", cleared({ clearedVersions: new Map([["bad", 1]]) })],
    ["by an hour range of its author", cleared({ clearedRanges: new Map([["bad", [[AT, AT + 5]]]]) })],
  ])("never shows a pose cleared %s", (_name, tombstones) => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(2, "good", "pgood0002", 5))],
      tombstones,
      entries: [place(1, "bad", "pbad00001", [[1, 1, 9]]), place(2, "good", "pgood0002", [[2, 2, 5]])],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 10)).toEqual([[2, 2, 5]]);
    expect(replayed(timelapse)).toEqual(timelapse.state);
  });

  // Quand la modération retire un pixel, alors son événement `clear` doit remettre la couleur du dessous.
  it("applies the clear events, which put the color underneath back", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(3, "good", "pgood0003", 5))],
      entries: [
        place(1, "bad", "pbad00001", [[1, 1, 9]]),
        clear(2, [[1, 1, 0, 9]]),
        place(3, "good", "pgood0003", [[2, 2, 5]]),
      ],
      tombstones: cleared({ clearedPlacements: new Set(["bad:pbad00001"]) }),
    };

    const timelapse = timelapseOf(scene);

    // La pose 1 n'est jamais appliquée, donc son retrait ne packed rien : un seul changement.
    expect(changesOf(timelapse, 10)).toEqual([[2, 2, 5]]);
  });

  // Quand un pixel est posé puis retiré par un `clear`, alors il apparaît puis disparaît.
  it("shows a pixel that was placed and cleared appearing then disappearing", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(3, "good", "pgood0003", 5))],
      entries: [
        place(1, "okay", "pokay0001", [[1, 1, 9]]),
        clear(2, [[1, 1, 0, 9]]),
        place(3, "good", "pgood0003", [[2, 2, 5]]),
      ],
    };

    expect(changesOf(timelapseOf(scene), 10)).toEqual([
      [1, 1, 9],
      [1, 1, 0],
      [2, 2, 5],
    ]);
  });

  // Les événements `hide` et `unhide` ne concernent que la vue OBS : ils ne changent aucune case.
  it("ignores the hide events", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(1, "good", "pgood0001", 5))],
      entries: [place(1, "good", "pgood0001", [[2, 2, 5]]), hide(2, [[2, 2, 0, 5]])],
    };

    expect(changesOf(timelapseOf(scene), 10)).toEqual([[2, 2, 5]]);
  });
});

describe("the last still of a timelapse", () => {
  // La dernière image est exactement `state` : chaque case qui diffère reçoit un dernier changement.
  it("ends exactly on the state, with a last packed for each cell that differs", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      // La case (2, 2) finit autrement que l'événement ne l'a posée ; la case (3, 3), sans événement, est déjà là au départ.
      cells: [
        [2, 2, 5],
        [3, 3, 7],
      ],
      piles: [pileAt(2, 2, entryOf(1, "good", "pgood0001", 5))],
      entries: [place(1, "good", "pgood0001", [[2, 2, 4]])],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 10)).toEqual([
      [2, 2, 4],
      [2, 2, 5],
    ]);
    expect(timelapse.initial[3 * 10 + 3]).toBe(7);
    expect(replayed(timelapse)).toEqual(timelapse.state);
  });

  // L'état de départ d'une case est le `previousColorIndex` de son premier événement, un événement effacé compris ;
  // une case sans événement garde sa couleur actuelle dès le début.
  it("starts a cell from the previous color of its first event, and an untouched cell as it is today", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [
        [1, 1, 6],
        [8, 8, 2],
      ],
      piles: [pileAt(1, 1, entryOf(2, "good", "pgood0002", 6))],
      tombstones: { ...NO_TOMBSTONES, clearedPlacements: new Set(["bad:pbad00001"]) },
      entries: [place(1, "bad", "pbad00001", [[1, 1, 9, 4]]), place(2, "good", "pgood0002", [[1, 1, 6, 9]])],
    };

    const timelapse = timelapseOf(scene);

    expect(timelapse.initial[1 * 10 + 1]).toBe(4);
    expect(timelapse.initial[8 * 10 + 8]).toBe(2);
    expect(replayed(timelapse)).toEqual(timelapse.state);
  });

  // Seuls les changements effectifs comptent : poser la couleur déjà visible n'ajoute rien.
  it("counts only the effective changes", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(2, "b", "pb000002", 5), entryOf(1, "a", "pa000001", 5))],
      entries: [place(1, "a", "pa000001", [[2, 2, 5]]), place(2, "b", "pb000002", [[2, 2, 5, 5]])],
    };

    expect(changesOf(timelapseOf(scene), 10)).toEqual([[2, 2, 5]]);
  });

  // Une pose de N cases compte N changements, dans l'ordre de ses cases.
  it("counts a pose of N cells as N changes in the order of its cells", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [
        [5, 5, 1],
        [1, 1, 2],
        [3, 3, 3],
      ],
      piles: [
        pileAt(5, 5, entryOf(1, "a", "pa000001", 1)),
        pileAt(1, 1, entryOf(1, "a", "pa000001", 2)),
        pileAt(3, 3, entryOf(1, "a", "pa000001", 3)),
      ],
      entries: [
        place(1, "a", "pa000001", [
          [5, 5, 1],
          [1, 1, 2],
          [3, 3, 3],
        ]),
      ],
    };

    expect(changesOf(timelapseOf(scene), 10)).toEqual([
      [5, 5, 1],
      [1, 1, 2],
      [3, 3, 3],
    ]);
  });

  // Les versions au-delà de celle lue avec `state` et les versions déjà vues ne comptent pas.
  it("ignores an entry newer than the state, and an entry seen twice", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[2, 2, 5]],
      piles: [pileAt(2, 2, entryOf(1, "a", "pa000001", 5))],
      maxVersion: 5,
      entries: [
        place(1, "a", "pa000001", [[2, 2, 5]]),
        place(1, "a", "pa000001", [[2, 2, 5]]),
        place(9, "b", "pb000009", [[3, 3, 8]]),
      ],
    };

    const { builder, result } = build(scene);

    expect(result.ok && result.value.changes).toHaveLength(1);
    expect(builder.lastVersion()).toBe(1);
  });
});

describe("a fresque recovered from a backup, whose piles keep the history", () => {
  // Quand aucun événement n'est connu mais que les piles gardent les versions, alors le système doit dessiner la fresque
  // dans l'ordre des poses, et finir sur `state`.
  it("draws the fresque in the order of its poses, from its piles alone", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [
        [1, 1, 2],
        [2, 2, 4],
        [3, 3, 3],
      ],
      piles: [
        pileAt(1, 1, entryOf(10, "a", "pa000010", 2)),
        pileAt(2, 2, entryOf(20, "b", "pb000020", 4), entryOf(8, "a", "pa000008", 6)),
        pileAt(3, 3, entryOf(5, "c", "pc000005", 3)),
      ],
      entries: [],
    };

    const timelapse = timelapseOf(scene);

    expect(changesOf(timelapse, 10)).toEqual([
      [3, 3, 3],
      [2, 2, 6],
      [1, 1, 2],
      [2, 2, 4],
    ]);
    expect(replayed(timelapse)).toEqual(timelapse.state);
    expect(timelapse.initial.every((color) => color === 0)).toBe(true);
  });

  // Une entrée de pile couverte par la modération n'est pas visible : elle ne devient pas un changement.
  it("leaves out the pile entries that the moderation covers", () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      cells: [[1, 1, 2]],
      piles: [pileAt(1, 1, entryOf(10, "a", "pa000010", 2), entryOf(4, "bad", "pbad00004", 9))],
      tombstones: { ...NO_TOMBSTONES, clearedPlacements: new Set(["bad:pbad00004"]) },
      entries: [],
    };

    expect(changesOf(timelapseOf(scene), 10)).toEqual([[1, 1, 2]]);
  });
});

describe("the refusals of a timelapse", () => {
  // Si aucune case ne packed, alors le système doit refuser, par une erreur nommée.
  it("refuses a fresque where nothing changes", () => {
    const { result } = build({ width: 10, height: 10, cells: [], entries: [] });

    expect(result).toEqual({ ok: false, error: "no_changes" });
  });

  // Si l'historique dépasse la limite, alors le système doit refuser, par une erreur nommée.
  it("refuses a history of more changes than the limit", () => {
    const { result } = build({
      width: 10,
      height: 10,
      cells: [],
      maxChanges: 2,
      entries: [
        place(1, "a", "pa000001", [
          [1, 1, 2],
          [2, 2, 3],
          [3, 3, 4],
        ]),
      ],
    });

    expect(result).toEqual({ ok: false, error: "too_many_changes" });
  });
});
