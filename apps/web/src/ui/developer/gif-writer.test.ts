import { describe, expect, it } from "vitest";
import { composeGif, decodeCompressed, parseGif } from "./gif-test-reader";
import { compressIndexes, createGifWriter, type Rgb } from "./gif-writer";

const PALETTE: Rgb[] = Array.from({ length: 44 }, (_, index) => [index * 5, 255 - index * 5, index]);

// Un dessin qui se répète sans être uniforme : la table de codes se remplit, se vide, et la largeur des codes grandit.
const noisy = (length: number, colors: number): Uint8Array => {
  let seed = 12345;
  return Uint8Array.from({ length }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) % colors;
  });
};

describe("le flux LZW d'un GIF (JOURNAL 2026-11-11)", () => {
  // Quand le dessin remplit la table de codes plusieurs fois, alors le décodage rend exactement les index d'entrée.
  it("decodes back to the indexes it was given, through table clears and code size changes", () => {
    for (const [length, colors] of [
      [1, 44],
      [2, 2],
      [5000, 44],
      [60_000, 44],
      [60_000, 4],
    ] as const) {
      const indexes = noisy(length, colors);

      const decoded = decodeCompressed(compressIndexes(indexes, 6), length);

      expect(decoded).toEqual(indexes);
    }
  });

  // Quand l'image n'a qu'une couleur, alors elle tient en quelques octets : des milliers de pixels pour quelques codes.
  it("compresses an image of one color to a few bytes", () => {
    const flat = new Uint8Array(640 * 640).fill(7);

    const compressed = compressIndexes(flat, 6);

    expect(compressed.length).toBeLessThan(2500);
    expect(decodeCompressed(compressed, flat.length)).toEqual(flat);
  });
});

describe("un GIF89a de plusieurs images (JOURNAL 2026-11-11)", () => {
  const build = () => {
    const writer = createGifWriter({ width: 8, height: 6, palette: PALETTE, transparentIndex: 43 });
    writer.addFrame({
      left: 0,
      top: 0,
      width: 8,
      height: 6,
      indexes: new Uint8Array(48).fill(3),
      delayCs: 50,
    });
    writer.addFrame({
      left: 2,
      top: 1,
      width: 3,
      height: 2,
      indexes: Uint8Array.of(9, 43, 9, 43, 11, 43),
      delayCs: 5,
    });
    writer.addFrame({ left: 7, top: 5, width: 1, height: 1, indexes: Uint8Array.of(1), delayCs: 300 });
    return { writer, bytes: writer.finish() };
  };

  // Quand on écrit trois images, alors le fichier a l'en-tête GIF89a, la boucle infinie, les délais et la fin `;`.
  it("starts with GIF89a, loops forever, keeps each delay and ends with a semicolon", () => {
    const { writer, bytes } = build();

    const gif = parseGif(bytes);

    expect(gif.header).toBe("GIF89a");
    expect([gif.width, gif.height]).toEqual([8, 6]);
    expect(gif.loops).toBe(0);
    expect(gif.trailer).toBe(0x3b);
    expect(writer.frameCount()).toBe(3);
    expect(gif.frames.map(({ delayCs }) => delayCs)).toEqual([50, 5, 300]);
    expect(gif.palette.slice(0, 4)).toEqual(PALETTE.slice(0, 4));
  });

  // Quand une image est un rectangle, alors elle garde sa position, son index transparent et la méthode « ne pas effacer ».
  it("places a rectangle where it was asked, with the transparent index and no disposal", () => {
    const { bytes } = build();

    const [, second] = parseGif(bytes).frames;

    expect(second).toMatchObject({ left: 2, top: 1, width: 3, height: 2, transparentIndex: 43, disposal: 1 });
  });

  // Quand les images se superposent, alors l'écran final est la première image, retouchée là où les suivantes ont dessiné.
  it("shows the last image laid over the first one, leaving the transparent cells alone", () => {
    const gif = parseGif(build().bytes);

    const screen = composeGif(gif, gif.frames.length);

    const expected = new Uint8Array(48).fill(3);
    expected[1 * 8 + 2] = 9;
    expected[1 * 8 + 4] = 9;
    expected[2 * 8 + 3] = 11;
    expected[5 * 8 + 7] = 1;
    expect(screen).toEqual(expected);
  });
});
