import { PALETTE } from "@liveplace/domain";
import { planStills } from "@liveplace/domain/timelapse-stills";
import { describe, expect, it } from "vitest";
import { composeGif, parseGif } from "./gif-test-reader";
import type { Rgb } from "./gif-writer";
import { type DecodedTimelapse, gifScale } from "./timelapse-frames";
import { buildTimelapseGif } from "./timelapse-gif";

const EMPTY: Rgb = [228, 226, 231];
const TRANSPARENT_GIF_INDEX = PALETTE.length;

const pack = (stateOffset: number, colorIndex: number): number => stateOffset * 256 + colorIndex;

// Ce que montre la dernière image : l'état de départ, puis chaque changement, chaque case agrandie en carré.
const lastScreen = ({ width, height, initial, changes }: DecodedTimelapse, scale: number): Uint8Array => {
  const shown = initial.slice();
  for (const packed of changes) shown[packed >>> 8] = packed & 0xff;
  const screen = new Uint8Array(width * scale * height * scale);
  for (let y = 0; y < height * scale; y++)
    for (let x = 0; x < width * scale; x++)
      screen[y * width * scale + x] = shown[Math.floor(y / scale) * width + Math.floor(x / scale)] ?? 0;
  return screen;
};

const small: DecodedTimelapse = {
  width: 4,
  height: 3,
  initial: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0]),
  changes: Uint32Array.of(pack(0, 5), pack(1, 5), pack(11, 7), pack(0, 6), pack(6, 9), pack(8, 0)),
};

// Mille deux cents changements sur 200 cases : chaque image en applique plusieurs, sur des cases éparses.
const busy = (): DecodedTimelapse => ({
  width: 20,
  height: 10,
  initial: new Uint8Array(200),
  changes: Uint32Array.from({ length: 1200 }, (_, at) => pack((at * 37) % 200, 1 + (at % 40))),
});

const build = (timelapse: DecodedTimelapse) => {
  const progress: [number, number][] = [];
  const built = buildTimelapseGif(timelapse, EMPTY, (done, total) => progress.push([done, total]));
  if (!built.ok) throw new Error(built.error);
  return { ...built.value, progress, gif: parseGif(built.value.bytes) };
};

describe("le GIF d'un timelapse (JOURNAL 2026-11-11)", () => {
  // Quand on encode un timelapse, alors le GIF a une image par image du plan, leurs délais, et se lit comme un GIF89a.
  it("has one image per still of the plan, with the delays of the plan", () => {
    const stills = planStills(small.changes.length);
    if (!stills.ok) throw new Error("plan refusé");

    const { gif, seconds } = build(small);

    expect(gif.header).toBe("GIF89a");
    expect(gif.frames.map(({ delayCs }) => delayCs)).toEqual(stills.value.map(({ delayCs }) => delayCs));
    expect(seconds).toBe(Math.round(stills.value.reduce((sum, { delayCs }) => sum + delayCs, 0) / 100));
    expect(gif.loops).toBe(0);
  });

  // Quand la fresque est petite, alors chaque case est un grand carré, et l'image se compte en pixels de GIF.
  it("scales each cell to a square of pixels", () => {
    const { gif, width, height } = build(small);

    expect([width, height]).toEqual([4 * gifScale(4, 3), 3 * gifScale(4, 3)]);
    expect([gif.width, gif.height]).toEqual([width, height]);
  });

  // Quand l'image est la première, alors elle est entière ; les suivantes n'ont que le rectangle de leurs cases changées.
  it("draws the whole fresque once, then only the rectangle of the cells that changed", () => {
    const scale = gifScale(4, 3);

    const { gif } = build(small);

    expect(gif.frames[0]).toMatchObject({ left: 0, top: 0, width: 4 * scale, height: 3 * scale });
    expect(gif.frames[1]).toMatchObject({ left: 0, top: 0, width: scale, height: scale });
    expect(gif.frames[2]).toMatchObject({ left: scale, top: 0, width: scale, height: scale });
    expect(gif.frames[0]?.transparentIndex).toBe(TRANSPARENT_GIF_INDEX);
  });

  // Quand la première image montre le départ, alors ses cases vides ont l'index 0 et la palette du GIF lui donne la couleur du vide.
  it("paints an empty cell with the color of the game's empty cell", () => {
    const { gif } = build(small);

    expect(gif.palette[0]).toEqual(EMPTY);
    expect(gif.palette[6]).toEqual([0x94, 0x49, 0x3a]); // PALETTE[6] = #94493a : la palette du jeu, sans quantification
    expect(composeGif(gif, 1)).toEqual(lastScreen({ ...small, changes: new Uint32Array(0) }, gifScale(4, 3)));
  });

  // Quand toutes les images sont posées l'une sur l'autre, alors l'écran est exactement la fresque d'arrivée.
  it("ends on the last state, once every image is laid over the others", () => {
    const { gif } = build(small);

    expect(composeGif(gif, gif.frames.length)).toEqual(lastScreen(small, gifScale(4, 3)));
  });

  // Quand une image touche plusieurs cases éparses, alors celles qu'elle n'a pas touchées dans son rectangle sont transparentes,
  // et la fresque d'arrivée reste exacte.
  it("leaves the untouched cells of a rectangle transparent, and still ends on the last state", () => {
    const timelapse = busy();
    const { gif, progress } = build(timelapse);

    const hasTransparentCells = gif.frames
      .slice(1)
      .some(({ indexes }) => indexes.includes(TRANSPARENT_GIF_INDEX));
    expect(hasTransparentCells).toBe(true);
    expect(gif.frames[0]?.indexes.includes(TRANSPARENT_GIF_INDEX)).toBe(false);
    expect(composeGif(gif, gif.frames.length)).toEqual(lastScreen(timelapse, gifScale(20, 10)));
    expect(progress.at(-1)).toEqual([gif.frames.length, gif.frames.length]);
  });

  // Quand l'encodage avance, alors la progression compte les images une à une jusqu'au total.
  it("reports every image once, up to the total", () => {
    const { progress } = build(small);

    expect(progress.map(([done]) => done)).toEqual(progress.map((_, at) => at + 1));
    expect(new Set(progress.map(([, total]) => total)).size).toBe(1);
  });

  // Quand rien ne change, alors il n'y a pas de GIF à faire.
  it("refuses a timelapse without any change", () => {
    const built = buildTimelapseGif({ ...small, changes: new Uint32Array(0) }, EMPTY, () => undefined);

    expect(built).toEqual({ ok: false, error: "no_changes" });
  });
});
