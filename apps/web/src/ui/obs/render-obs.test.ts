import { describe, expect, it } from "vitest";
import { type Call, recordingContext, tagged } from "../canvas/recording-context";
import { type ObsFrame, renderObs } from "./render-obs";

const PALETTE = ["#00000000", "#ec273f", "#36c5f4", "#ffffff"];
const IMAGE = tagged("image");
const LEVELS = [tagged("blocks of 8"), tagged("blocks of 4"), tagged("blocks of 2")];

// Une surface de 100 px, la fresque de 8 × 8 cases dans un cadre de 80 px : une case fait 10 px, et la case (2, 3) occupe [30, 40, 10, 10].
const FRAME = { left: 10, top: 10, width: 80, height: 80 };
const CELL_RECT = [30, 40, 10, 10].join();

const frameOf = (parts: Partial<ObsFrame> = {}): ObsFrame => ({
  surface: { width: 100, height: 100 },
  frame: FRAME,
  canvas: { width: 8, height: 8 },
  image: IMAGE,
  palette: PALETTE,
  backdrop: { fill: null, image: null },
  reveal: null,
  arriving: [],
  ghost: null,
  ...parts,
});

const render = (parts: Partial<ObsFrame> = {}) => {
  const { context, calls } = recordingContext();
  renderObs(context, frameOf(parts));
  return { context, calls };
};

const images = (calls: readonly Call[]) =>
  calls.filter((call) => call.op === "drawImage").map(({ source, alpha, args }) => ({ source, alpha, args }));

const arriving = (progress: number, colorIndex = 2) => [
  { x: 2, y: 3, base: [{ colorIndex: 1, alpha: 1 }], colorIndex, progress },
];

describe("une image de la vue OBS", () => {
  // Sans effet, la vue OBS dessine comme avant : la surface vidée, puis l'image dans son cadre
  it("clears the surface and draws the image in its frame, as before, when nothing is running", () => {
    const { calls } = render();

    expect(calls[0]).toMatchObject({ op: "clearRect", rect: [0, 0, 100, 100] });
    expect(images(calls)).toEqual([{ source: "image", alpha: 1, args: [10, 10, 80, 80] }]);
  });

  // Le fond d'abord, sous les pixels, dans le cadre seulement
  it("paints the backdrop first, under the pixels, inside the frame only", () => {
    const { calls } = render({ backdrop: { fill: "black", image: null } });
    const fill = calls.findIndex((call) => call.op === "fillRect" && call.style === "black");

    expect(calls[fill]?.rect).toEqual([10, 10, 80, 80]);
    expect(fill).toBeLessThan(calls.findIndex((call) => call.op === "drawImage"));
  });

  // La mosaïque de l'apparition : les mêmes étapes que dans le jeu, dans le cadre de la vue OBS, le fond déjà dessous
  it("draws the steps of the mosaic in its frame, the backdrop already under the blocks", () => {
    const { calls } = render({
      backdrop: { fill: "black", image: null },
      reveal: { levels: LEVELS, step: 1, progress: 0.25 },
    });

    expect(images(calls).map(({ source, alpha }) => [source, alpha])).toEqual([
      ["blocks of 8", 1],
      ["blocks of 4", 0.25],
    ]);
    expect(images(calls)[1]?.args).toEqual([0, 0, 2, 2, 10, 10, 80, 80]);
    expect(calls.findIndex((call) => call.style === "black")).toBeLessThan(
      calls.findIndex((call) => call.source === "blocks of 8"),
    );
  });

  // Une case des autres joueurs en fondu : refaite dans son rectangle, sur le cadre de la vue OBS
  it("redraws an arriving cell in its own rectangle of the frame", () => {
    const { calls } = render({ arriving: arriving(0.5) });
    const start = calls.findIndex((call) => call.op === "clearRect" && call.rect?.join() === CELL_RECT);

    expect(calls.slice(start).map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 1, PALETTE[1]],
      ["fillRect", 0.5, PALETTE[2]],
    ]);
  });

  // Le fond ne se troue jamais : sur un fond noir, la case vidée le retrouve dans son seul rectangle, avant ses couleurs
  it("never leaves a hole in the backdrop: the cleared cell gets it back, inside its own rectangle", () => {
    const { calls } = render({ backdrop: { fill: "black", image: null }, arriving: arriving(0.5) });
    const start = calls.findIndex((call) => call.op === "clearRect" && call.rect?.join() === CELL_RECT);

    expect(calls.slice(start, start + 7).map(({ op, style, rect }) => [op, style, rect?.join()])).toEqual([
      ["clearRect", "", CELL_RECT],
      ["save", "", undefined],
      ["rect", "", CELL_RECT],
      ["clip", "", undefined],
      ["fillRect", "black", "10,10,80,80"],
      ["restore", "", undefined],
      ["fillRect", PALETTE[1], CELL_RECT],
    ]);
  });

  // Sans fond (le transparent), la case vidée reste vide : la source d'OBS se voit à travers
  it("leaves a cleared cell empty on a transparent backdrop, for the OBS source to show through", () => {
    const { calls } = render({ arriving: arriving(0.5) });

    expect(calls.some((call) => call.op === "clip")).toBe(false);
  });

  // Une case vers le transparent efface l'ancienne couleur à mesure
  it("fades the old color out when a cell goes back to transparent", () => {
    const { calls } = render({ arriving: arriving(0.5, 0) });
    const start = calls.findIndex((call) => call.op === "clearRect" && call.rect?.join() === CELL_RECT);

    expect(calls.slice(start).map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 0.5, PALETTE[1]],
    ]);
  });

  // Les cases tombent juste dans un cadre qui n'est pas un multiple de la surface : 4 px ici, 5 px là, et la dernière touche le bord
  it("keeps the cells of a frame that is not a whole number of pixels flush with each other and the edge", () => {
    const frame = { left: 5.5, top: 0, width: 50, height: 50 }; // 12 cases de 4,17 px
    const last = render({
      frame,
      canvas: { width: 12, height: 12 },
      arriving: [{ x: 11, y: 11, base: [{ colorIndex: 1, alpha: 1 }], colorIndex: 2, progress: 0.5 }],
    });
    const [left = 0, top = 0, width = 0, height = 0] =
      last.calls.find((call) => call.op === "clearRect" && call.rect?.[2] !== 100)?.rect ?? [];

    expect(left + width).toBe(Math.round(5.5 + 50));
    expect(top + height).toBe(50);
    expect(width).toBeGreaterThanOrEqual(4);
    expect(width).toBeLessThanOrEqual(5);
  });

  // La fresque quittée s'efface par-dessus, en dernier
  it("draws the fresque that was left behind last, over everything", () => {
    const { calls } = render({
      ghost: { source: tagged("left behind"), alpha: 0.3 },
      arriving: arriving(0.5),
    });

    expect(images(calls).at(-1)).toEqual({ source: "left behind", alpha: 0.3, args: [0, 0] });
  });

  // Chaque effet rend l'opacité entière au suivant
  it("gives each effect the full opacity back for the next one", () => {
    const { context } = render({
      reveal: { levels: LEVELS, step: 0, progress: 0.4 },
      arriving: arriving(0.5),
      ghost: { source: tagged("left behind"), alpha: 0.3 },
    });

    expect(context.globalAlpha).toBe(1);
  });
});
