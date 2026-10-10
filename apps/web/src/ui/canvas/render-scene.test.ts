import { describe, expect, it } from "vitest";
import { renderScene, type Scene, type SettlingBatch } from "./render-scene";

const PALETTE = ["#00000000", "#ec273f", "#36c5f4", "#ffffff"];
const SHADES = { void: "void", border: "border", grid: "grid", outlineIn: "in", outlineOut: "out" };
const NO_OP = (): void => undefined;

type Call = { op: "clearRect" | "fillRect" | "stroke"; alpha: number; style: string; rect?: number[] };

type FakeContext = Pick<
  CanvasRenderingContext2D,
  "globalAlpha" | "fillStyle" | "strokeStyle" | "lineWidth" | "lineCap" | "imageSmoothingEnabled"
> & {
  setTransform: (...args: never[]) => void;
  clearRect: (...args: never[]) => void;
  drawImage: (...args: never[]) => void;
  fillRect: (...args: never[]) => void;
  strokeRect: (...args: never[]) => void;
  beginPath: () => void;
  moveTo: (...args: never[]) => void;
  lineTo: (...args: never[]) => void;
  stroke: () => void;
};

// Un contexte qui note ce qu'on lui demande : l'opacité et la teinte du moment, et le rectangle des remplissages.
const recordingContext = () => {
  const calls: Call[] = [];
  const fake: FakeContext = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    imageSmoothingEnabled: true,
    setTransform: NO_OP,
    drawImage: NO_OP,
    strokeRect: NO_OP,
    beginPath: NO_OP,
    moveTo: NO_OP,
    lineTo: NO_OP,
    clearRect: (...rect: number[]) => {
      calls.push({ op: "clearRect", alpha: fake.globalAlpha, style: "", rect });
    },
    fillRect: (...rect: number[]) => {
      calls.push({ op: "fillRect", alpha: fake.globalAlpha, style: String(fake.fillStyle), rect });
    },
    stroke: () => {
      calls.push({ op: "stroke", alpha: fake.globalAlpha, style: String(fake.strokeStyle) });
    },
  };
  return { context: fake as CanvasRenderingContext2D, calls };
};

// Une case de 10 px à l'écran : la case (2, 3) occupe le rectangle [20, 30, 10, 10].
const CELL_RECT = [20, 30, 10, 10];
const CELL = { x: 2, y: 3 };

type SceneParts = {
  draft?: Scene["draft"];
  settling?: readonly SettlingBatch[];
  shown?: number;
  confirmed?: number;
};

// `shown` : la couleur de l'image sous la case, pose optimiste comprise ; `confirmed` : celle que le serveur a confirmée.
const sceneOf = ({ draft = [], settling = [], shown = 0, confirmed = shown }: SceneParts): Scene => ({
  screen: { width: 100, height: 100 },
  pixelRatio: 1,
  viewport: { scale: 10, offsetX: 0, offsetY: 0 },
  canvas: { width: 10, height: 10 },
  image: {} as HTMLCanvasElement,
  shades: SHADES,
  targetCell: null,
  inspectedCell: null,
  draft,
  settling,
  palette: PALETTE,
  colorIndexAt: () => shown,
  confirmedColorIndexAt: () => confirmed,
});

const isOutline = (call: Call) => call.op === "stroke" && (call.style === "in" || call.style === "out");
const isOnCell = (call: Call) => call.rect?.join() === CELL_RECT.join();

const render = (parts: SceneParts) => {
  const { context, calls } = recordingContext();
  renderScene(context, sceneOf(parts));
  return calls;
};

// `outline` : les traits des cases qui se posent seuls, ceux du brouillon (même vide) retirés.
const paint = (parts: SceneParts) => {
  const calls = render(parts);
  const draftOutlineLength = render({ ...parts, settling: [] }).filter(isOutline).length;
  return { calls, cell: calls.filter(isOnCell), outline: calls.filter(isOutline).slice(draftOutlineLength) };
};

const settlingOf = (progress: number, colorIndex: number, previousColorIndex: number): SettlingBatch => ({
  pixels: [{ ...CELL, colorIndex, previousColorIndex }],
  progress,
});

describe("une case du brouillon (CDC 2026)", () => {
  // Une case du brouillon sur une image qui n'a pas bougé : 60 % de sa couleur, sans toucher à l'image dessous
  it("shows a draft cell at 60 % over the image, without repainting the image under it", () => {
    const { cell } = paint({ draft: [{ ...CELL, colorIndex: 2 }], shown: 1 });

    expect(cell).toEqual([{ op: "fillRect", alpha: 0.6, style: PALETTE[2], rect: CELL_RECT }]);
  });

  // Une case en vol : l'image porte déjà la pose optimiste, la case reprend la couleur d'avant sous son aspect brouillon
  it("gives a draft cell in flight the color it replaces back, under its 60 % look", () => {
    const { cell } = paint({ draft: [{ ...CELL, colorIndex: 2 }], shown: 2, confirmed: 1 });

    expect(cell).toEqual([
      { op: "clearRect", alpha: 1, style: "", rect: CELL_RECT },
      { op: "fillRect", alpha: 1, style: PALETTE[1], rect: CELL_RECT },
      { op: "fillRect", alpha: 0.6, style: PALETTE[2], rect: CELL_RECT },
    ]);
  });

  // Une gomme en vol : son aspect couvre la case, la couleur d'avant n'y est que pâlie, et l'image dessous n'est que vidée
  it("shows an eraser in flight with the color it replaces faded, over a cleared cell", () => {
    const { cell } = paint({ draft: [{ ...CELL, colorIndex: 0 }], shown: 0, confirmed: 1 });

    expect(cell.map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 1, "void"],
      ["fillRect", 0.35, PALETTE[1]],
    ]);
  });
});

describe("une case qui se pose", () => {
  // Au départ, elle a l'aspect du brouillon : sa couleur à 60 % sur celle d'avant, le contour entier
  it("starts with the look of the draft: 60 % over the previous color, with its whole outline", () => {
    const { cell, outline } = paint({ settling: [settlingOf(0, 2, 1)], shown: 2 });

    expect(cell).toEqual([
      { op: "clearRect", alpha: 1, style: "", rect: CELL_RECT },
      { op: "fillRect", alpha: 1, style: PALETTE[1], rect: CELL_RECT },
      { op: "fillRect", alpha: 0.6, style: PALETTE[2], rect: CELL_RECT },
    ]);
    expect(outline.map((stroke) => stroke.alpha)).toEqual([1, 1]);
  });

  // À mi-chemin, l'opacité est à mi-chemin entre 0,6 et 1 et le contour à moitié effacé
  it("is halfway from 60 % to full opacity at the middle, with its outline half faded", () => {
    const { cell, outline } = paint({ settling: [settlingOf(0.5, 2, 1)], shown: 2 });

    expect(cell.at(-1)?.alpha).toBeCloseTo(0.8);
    expect(cell.at(-1)?.style).toBe(PALETTE[2]);
    for (const stroke of outline) expect(stroke.alpha).toBeCloseTo(0.5);
  });

  // Au bout, elle est pleine et sans contour
  it("ends full and without an outline", () => {
    const { cell, outline } = paint({ settling: [settlingOf(1, 2, 1)], shown: 2 });

    expect(cell.at(-1)?.alpha).toBe(1);
    for (const stroke of outline) expect(stroke.alpha).toBe(0);
  });

  // Une case posée sur du transparent se pose sur le vide, pas sur une couleur
  it("settles over the empty canvas when it replaces a transparent cell", () => {
    const { cell } = paint({ settling: [settlingOf(0, 2, 0)], shown: 2 });

    expect(cell.map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 1, PALETTE[0]],
      ["fillRect", 0.6, PALETTE[2]],
    ]);
  });

  // Une gomme qui se pose s'efface en entier : le vide, la couleur pâlie et la croix perdent leur opacité ensemble
  it("fades a settling eraser out whole: the void, the faded color and the cross", () => {
    const { calls } = paint({ settling: [settlingOf(0.5, 0, 1)], shown: 0 });
    const eraser = calls.filter((call) => call.op === "fillRect" && isOnCell(call));

    expect(eraser.map((call) => call.style)).toEqual(["void", PALETTE[1]]);
    expect(eraser[0]?.alpha).toBeCloseTo(0.5);
    expect(eraser[1]?.alpha).toBeCloseTo(0.175);
    expect(
      calls.some((call) => call.op === "fillRect" && call.style === PALETTE[1] && call.alpha === 1),
    ).toBe(false);
    expect(calls.filter((call) => call.op === "stroke" && call.style === "in")[0]?.alpha).toBeCloseTo(0.5);
  });

  // Sans case qui se pose, l'image n'est jamais vidée
  it("never clears the image when nothing is settling", () => {
    const { calls } = paint({ draft: [{ ...CELL, colorIndex: 2 }], shown: 1 });

    expect(calls.some((call) => call.op === "clearRect" && isOnCell(call))).toBe(false);
  });

  // Plusieurs lots se posent chacun à leur allure
  it("settles each batch at its own pace", () => {
    const { outline } = paint({
      settling: [
        settlingOf(0.25, 2, 1),
        { ...settlingOf(0.75, 3, 1), pixels: [{ x: 5, y: 5, colorIndex: 3, previousColorIndex: 1 }] },
      ],
      shown: 2,
    });

    expect(outline.map((stroke) => stroke.alpha)).toEqual([0.75, 0.75, 0.25, 0.25]);
  });
});
