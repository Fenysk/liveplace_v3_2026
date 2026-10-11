// Un faux contexte 2D qui note ce qu'on lui demande, pour les tests de rendu du jeu et de la vue OBS : l'opacité et la teinte
// du moment, les rectangles, et l'étiquette de chaque image dessinée.

const NO_OP = (): void => undefined;

export type Call = {
  op: "clearRect" | "fillRect" | "stroke" | "drawImage" | "save" | "restore" | "rect" | "clip";
  alpha: number;
  style: string;
  rect?: number[];
  source?: string | undefined; // l'étiquette de l'image dessinée
  args?: number[];
};

// Des images d'essai, que le faux contexte reconnaît à leur étiquette.
const TAGS = new WeakMap<object, string>();
export const tagged = (tag: string): HTMLCanvasElement => {
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
export const recordingContext = () => {
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
