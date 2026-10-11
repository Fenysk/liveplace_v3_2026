import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { renderGhost, renderScene, type Scene, type SettlingBatch } from "./render-scene";

const PALETTE = ["#00000000", "#ec273f", "#36c5f4", "#ffffff"];
const SHADES = { void: "void", border: "border", grid: "grid", outlineIn: "in", outlineOut: "out" };
const NO_OP = (): void => undefined;

type Call = {
  op: "clearRect" | "fillRect" | "stroke" | "drawImage" | "save" | "restore" | "rect" | "clip";
  alpha: number;
  style: string;
  rect?: number[];
  source?: string | undefined; // l'étiquette de l'image dessinée
  args?: number[];
};

// Des images d'essai, que le faux contexte reconnaît à leur étiquette.
const TAGS = new WeakMap<object, string>();
const tagged = (tag: string): HTMLCanvasElement => {
  const element = {} as HTMLCanvasElement;
  TAGS.set(element, tag);
  return element;
};
const IMAGE = tagged("image");

type FakeContext = Pick<
  CanvasRenderingContext2D,
  "canvas" | "globalAlpha" | "fillStyle" | "strokeStyle" | "lineWidth" | "lineCap" | "imageSmoothingEnabled"
> & {
  setTransform: (...args: never[]) => void;
  save: () => void;
  restore: () => void;
  rect: (...args: never[]) => void;
  clip: () => void;
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
    canvas: IMAGE,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    imageSmoothingEnabled: true,
    setTransform: NO_OP,
    save: () => {
      calls.push({ op: "save", alpha: fake.globalAlpha, style: "" });
    },
    restore: () => {
      calls.push({ op: "restore", alpha: fake.globalAlpha, style: "" });
    },
    rect: (...rect: number[]) => {
      calls.push({ op: "rect", alpha: fake.globalAlpha, style: "", rect });
    },
    clip: () => {
      calls.push({ op: "clip", alpha: fake.globalAlpha, style: "" });
    },
    drawImage: (source: object, ...args: number[]) => {
      calls.push({ op: "drawImage", alpha: fake.globalAlpha, style: "", source: TAGS.get(source), args });
    },
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
  draftFades?: Scene["draftFades"];
  settling?: readonly SettlingBatch[];
  arriving?: Scene["arriving"];
  backdrop?: Scene["backdrop"];
  reveal?: Scene["reveal"];
  ghost?: Scene["ghost"];
  shown?: number;
  confirmed?: number;
};

// `shown` : la couleur de l'image sous la case, pose optimiste comprise ; `confirmed` : celle que le serveur a confirmée.
const sceneOf = ({
  draft = [],
  draftFades = new Map(),
  settling = [],
  arriving = [],
  backdrop = { fill: null, image: null },
  reveal = null,
  ghost = null,
  shown = 0,
  confirmed = shown,
}: SceneParts): Scene => ({
  screen: { width: 100, height: 100 },
  pixelRatio: 1,
  viewport: { scale: 10, offsetX: 0, offsetY: 0 },
  canvas: { width: 10, height: 10 },
  image: IMAGE,
  backdrop,
  reveal,
  ghost,
  shades: SHADES,
  targetCell: null,
  inspectedCell: null,
  draft,
  draftFades,
  arriving,
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

// La case (2, 3) entre au brouillon ; `from` nul : une case neuve, sinon sa couleur d'avant.
const fadeOf = (progress: number, from: number | null = null): Scene["draftFades"] =>
  new Map([[toCellKey(CELL.x, CELL.y), { progress, from }]]);

describe("une case qui entre au brouillon", () => {
  // Au départ elle est invisible, à mi-chemin à moitié de ses 60 %, au bout entière
  it("fades in from nothing to its 60 % look", () => {
    const alphas = [0, 0.5, 1].map(
      (progress) =>
        paint({ draft: [{ ...CELL, colorIndex: 2 }], draftFades: fadeOf(progress) }).cell.at(-1)?.alpha,
    );

    expect(alphas).toEqual([0, 0.3, 0.6]);
  });

  // Une gomme qui entre s'efface en entier, le vide et la croix avec elle, jusqu'à son aspect gommé
  it("fades an eraser in whole, up to its erased look", () => {
    const { calls } = paint({ draft: [{ ...CELL, colorIndex: 0 }], draftFades: fadeOf(0.5), confirmed: 1 });
    const eraser = calls.filter((call) => call.op === "fillRect" && isOnCell(call));

    expect(eraser.map((call) => [call.style, call.alpha])).toEqual([
      ["void", 0.5],
      [PALETTE[1], 0.175],
    ]);
    expect(calls.filter((call) => call.op === "stroke" && call.style === "in")[0]?.alpha).toBe(0.5);
  });

  // Une case repeinte passe de l'ancienne couleur à la nouvelle : l'une s'efface, l'autre paraît, sans saut aux deux bouts
  it("crosses from the old color to the new one when a cell is repainted", () => {
    const at = (progress: number) =>
      paint({ draft: [{ ...CELL, colorIndex: 2 }], draftFades: fadeOf(progress, 1) }).cell.map((call) => [
        call.style,
        Number(call.alpha.toFixed(3)),
      ]);

    expect(at(0)).toEqual([
      [PALETTE[1], 0.6],
      [PALETTE[2], 0],
    ]);
    expect(at(0.25)).toEqual([
      [PALETTE[1], 0.45],
      [PALETTE[2], 0.15],
    ]);
    expect(at(1)).toEqual([
      [PALETTE[1], 0],
      [PALETTE[2], 0.6],
    ]);
  });

  // Une case du brouillon que la table ne cite pas reste entière, à côté de celle qui entre
  it("leaves a draft cell the table does not name whole, beside the one fading in", () => {
    const { calls } = paint({
      draft: [
        { ...CELL, colorIndex: 2 },
        { x: 5, y: 5, colorIndex: 2 },
      ],
      draftFades: fadeOf(0.5),
    });
    const alphaAt = (left: number) =>
      calls.filter((call) => call.op === "fillRect" && call.rect?.[0] === left).at(-1)?.alpha;

    expect(alphaAt(CELL_RECT[0] ?? 0)).toBe(0.3);
    expect(alphaAt(50)).toBe(0.6);
  });
});

describe("le contour du brouillon pendant un fondu", () => {
  const strokesAlphas = (parts: SceneParts, style: "in" | "out") =>
    render(parts)
      .filter((call) => call.op === "stroke" && call.style === style)
      .map((call) => call.alpha);
  const NEIGHBOR = { x: 3, y: 3, colorIndex: 2 };

  // Une case seule qui entre : son contour paraît avec elle
  it("fades the outline of a lone cell in with it", () => {
    expect(strokesAlphas({ draft: [{ ...CELL, colorIndex: 2 }], draftFades: fadeOf(0.25) }, "in")).toEqual([
      0.25,
    ]);
  });

  // Contre une case déjà là, l'arête commune s'efface à mesure : l'ensemble du contour ne saute ni ne clignote
  it("fades the shared edge out as the cell beside it fades in, so the outline never jumps", () => {
    const alphas = strokesAlphas(
      { draft: [NEIGHBOR, { ...CELL, colorIndex: 2 }], draftFades: fadeOf(0.25) },
      "in",
    );

    expect([...alphas].sort()).toEqual([0.25, 0.75, 1]);
  });

  // À la fin du fondu, l'arête commune n'existe plus, comme pour un brouillon sans fondu
  it("ends as the outline of a draft without a fade", () => {
    const draft = [NEIGHBOR, { ...CELL, colorIndex: 2 }];

    expect(strokesAlphas({ draft, draftFades: fadeOf(1) }, "in")).toEqual(strokesAlphas({ draft }, "in"));
    expect(strokesAlphas({ draft, draftFades: fadeOf(1) }, "in")).toEqual([1]);
  });

  // Le noir passe sous le blanc, fondu ou pas : tout le noir d'abord, puis tout le blanc
  it("keeps all the black strokes under all the white ones", () => {
    const styles = render({ draft: [NEIGHBOR, { ...CELL, colorIndex: 2 }], draftFades: fadeOf(0.25) })
      .filter(isOutline)
      .map((call) => call.style);

    expect(styles).toEqual(["out", "out", "out", "in", "in", "in"]);
  });

  // Une case repeinte y est déjà : son contour ne bouge pas
  it("keeps the outline of a repainted cell whole", () => {
    expect(strokesAlphas({ draft: [{ ...CELL, colorIndex: 2 }], draftFades: fadeOf(0.25, 1) }, "in")).toEqual(
      [1],
    );
  });
});

const LEVELS = [tagged("blocks of 8"), tagged("blocks of 4"), tagged("blocks of 2")];
const images = (parts: SceneParts) =>
  render(parts)
    .filter((call) => call.op === "drawImage")
    .map(({ source, alpha, args }) => ({ source, alpha, args }));

// Le canvas de 10 × 10 cases de 10 px, à l'origine : l'image remplit [0, 0, 100, 100].
describe("la fresque qui paraît en mosaïque", () => {
  // Sans apparition, l'image est dessinée d'un coup, comme avant
  it("draws the image whole, as before, when nothing is revealing", () => {
    expect(images({})).toEqual([{ source: "image", alpha: 1, args: [0, 0, 100, 100] }]);
  });

  // La première étape arrive en fondu depuis le vide : les blocs de 8, seuls, à l'opacité de l'étape
  it("fades the blocks of 8 in from nothing at the first step", () => {
    const drawn = images({ reveal: { levels: LEVELS, step: 0, progress: 0.4 } });

    expect(drawn).toEqual([
      { source: "blocks of 8", alpha: 0.4, args: [0, 0, 10 / 8, 10 / 8, 0, 0, 100, 100] },
    ]);
  });

  // Aux étapes suivantes, l'étape d'avant reste entière dessous, la nouvelle paraît dessus : un fondu enchaîné
  it("keeps the step before whole underneath while the next one fades in", () => {
    const drawn = images({ reveal: { levels: LEVELS, step: 1, progress: 0.25 } });

    expect(drawn.map(({ source, alpha }) => [source, alpha])).toEqual([
      ["blocks of 8", 1],
      ["blocks of 4", 0.25],
    ]);
    expect(drawn[1]?.args).toEqual([0, 0, 10 / 4, 10 / 4, 0, 0, 100, 100]);
  });

  // La dernière étape est l'image nette, celle du moment, qui paraît sur les blocs de 2
  it("ends with the sharp current image fading in over the blocks of 2", () => {
    const drawn = images({ reveal: { levels: LEVELS, step: 3, progress: 0.5 } });

    expect(drawn.map(({ source, alpha }) => [source, alpha])).toEqual([
      ["blocks of 2", 1],
      ["image", 0.5],
    ]);
    expect(drawn[1]?.args).toEqual([0, 0, 10, 10, 0, 0, 100, 100]);
  });

  // Les blocs s'agrandissent sans lissage, et l'opacité revient à 1 pour le reste de l'image
  it("scales the blocks up without smoothing, and gives the rest of the scene its full opacity back", () => {
    const { context, calls } = recordingContext();
    renderScene(context, sceneOf({ reveal: { levels: LEVELS, step: 0, progress: 0.4 } }));

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.globalAlpha).toBe(1);
    expect(calls.find((call) => call.op === "drawImage")?.alpha).toBe(0.4);
  });
});

describe("la fresque que la page vient de quitter", () => {
  // Elle se dessine en dernier, tout en haut, à son opacité
  it("is drawn last, over everything, at its own opacity", () => {
    const drawn = images({ ghost: { source: tagged("left behind"), alpha: 0.3 } });

    expect(drawn.at(-1)).toEqual({ source: "left behind", alpha: 0.3, args: [0, 0] });
    expect(drawn).toHaveLength(2);
  });

  // En attendant la nouvelle, la page la garde seule : l'écran est vidé, puis elle est reposée telle quelle
  it("is kept alone on screen while the new fresque is awaited", () => {
    const { context, calls } = recordingContext();

    renderGhost(context, tagged("left behind"));

    expect(calls.map((call) => call.op)).toEqual(["clearRect", "drawImage"]);
    expect(calls[1]?.source).toBe("left behind");
  });
});

describe("une case posée par un autre joueur, en fondu", () => {
  const arrivingOf = (progress: number, colorIndex: number, base = [{ colorIndex: 1, alpha: 1 }]) => ({
    arriving: [{ ...CELL, base, colorIndex, progress }],
  });

  // L'image porte déjà la nouvelle couleur : la case est vidée, l'ancienne refaite dessous, la nouvelle posée dessus à l'avancée
  it("clears the cell, remakes the old color under it and fades the new one in over it", () => {
    const { cell } = paint(arrivingOf(0.25, 2));

    expect(cell.map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 1, PALETTE[1]],
      ["fillRect", 0.25, PALETTE[2]],
    ]);
  });

  // À l'avancée 0 la case montre encore l'ancienne couleur seule, comme avant l'arrivée : aucun saut au départ
  it("shows the old color alone at progress 0, so nothing jumps when the cell arrives", () => {
    const { cell } = paint(arrivingOf(0, 2));

    expect(cell.at(-1)).toMatchObject({ style: PALETTE[2], alpha: 0 });
    expect(cell.at(-2)).toMatchObject({ style: PALETTE[1], alpha: 1 });
  });

  // Vers le transparent, l'ancienne s'efface : la case vidée garde le damier dessous
  it("fades the old color out when the cell goes back to transparent", () => {
    const { cell } = paint(arrivingOf(0.5, 0));

    expect(cell.map(({ op, alpha, style }) => [op, alpha, style])).toEqual([
      ["clearRect", 1, ""],
      ["fillRect", 0.5, PALETTE[1]],
    ]);
  });

  // Une case réécrite pendant son fondu repart de ses couleurs superposées
  it("starts a rewritten cell again from the layers it was showing", () => {
    const base = [
      { colorIndex: 1, alpha: 1 },
      { colorIndex: 2, alpha: 0.4 },
    ];

    const { cell } = paint(arrivingOf(0.5, 3, base));

    expect(cell.filter((call) => call.op === "fillRect").map(({ alpha, style }) => [style, alpha])).toEqual([
      [PALETTE[1], 1],
      [PALETTE[2], 0.4],
      [PALETTE[3], 0.5],
    ]);
  });

  // Le reste de la scène retrouve son opacité entière, et sans case en fondu l'image n'est pas vidée
  it("gives the rest of the scene its full opacity back, and clears nothing without an arriving cell", () => {
    const { context } = recordingContext();
    renderScene(context, sceneOf(arrivingOf(0.5, 2)));

    expect(context.globalAlpha).toBe(1);
    expect(paint({}).calls.some((call) => call.op === "clearRect" && isOnCell(call))).toBe(false);
  });
});

describe("les effets sur une fresque à fond noir, blanc ou image (Écart §9.1, JOURNAL 2026-10-10)", () => {
  const BLACK = { fill: "black", image: null } as const;
  const arriving = [{ ...CELL, base: [{ colorIndex: 1, alpha: 1 }], colorIndex: 2, progress: 0.5 }];

  // Une case vidée pour être refaite retrouve le fond dans son seul rectangle, avant ses couleurs : pas de trou dans le fond
  it("gives the backdrop back to a cell it clears, inside its own rectangle only, before its colors", () => {
    const { calls } = paint({ arriving, backdrop: BLACK });
    const start = calls.findIndex((call) => call.op === "clearRect" && isOnCell(call));

    expect(calls.slice(start, start + 8).map(({ op, style, rect }) => [op, style, rect?.join()])).toEqual([
      ["clearRect", "", CELL_RECT.join()],
      ["save", "", undefined],
      ["rect", "", CELL_RECT.join()],
      ["clip", "", undefined],
      ["fillRect", "black", "0,0,100,100"],
      ["restore", "", undefined],
      ["fillRect", PALETTE[1], CELL_RECT.join()],
      ["fillRect", PALETTE[2], CELL_RECT.join()],
    ]);
  });

  // Sans fond (le transparent sans image), une case vidée reste vide : le damier du jeu se voit à travers
  it("leaves a cleared cell empty without a backdrop, for the checkerboard to show through", () => {
    const { calls } = paint({ arriving });

    expect(calls.some((call) => call.op === "clip")).toBe(false);
  });

  // Une pose en vol ou qui se pose refait sa case de la même façon : le fond d'abord
  it("does the same for a cell that settles", () => {
    const { calls } = paint({ settling: [settlingOf(0.5, 2, 1)], shown: 2, backdrop: BLACK });
    const start = calls.findIndex((call) => call.op === "clearRect" && isOnCell(call));

    expect(calls.slice(start, start + 6).map((call) => call.op)).toEqual([
      "clearRect",
      "save",
      "rect",
      "clip",
      "fillRect",
      "restore",
    ]);
  });

  // Pendant la mosaïque, le fond est déjà peint sous les blocs : il vient avant la première étape
  it("paints the backdrop before the first step of the mosaic, so it is already there under the blocks", () => {
    const { calls } = paint({ backdrop: BLACK, reveal: { levels: LEVELS, step: 0, progress: 0.5 } });
    const fill = calls.findIndex((call) => call.op === "fillRect" && call.style === "black");
    const blocks = calls.findIndex((call) => call.source === "blocks of 8");

    expect(fill).toBeGreaterThanOrEqual(0);
    expect(fill).toBeLessThan(blocks);
  });
});
