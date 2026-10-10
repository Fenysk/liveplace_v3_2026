import { PALETTE } from "@liveplace/domain";
import type { CanvasImage } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import type { IndexedImage, RgbImage } from "../../shared/indexed-image";
import { darkShade } from "../design/dark-shade";
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, renderBackdrop, renderCanvasBitmap } from "./preview-image";

const hexOf = ([red, green, blue]: readonly number[]): string =>
  `#${[red, green, blue].map((channel) => (channel ?? 0).toString(16).padStart(2, "0")).join("")}`;

// La couleur d'un pixel de l'image à palette, pas son index
const colorAt = (image: IndexedImage, x: number, y: number): string =>
  hexOf(image.palette[image.pixels[y * image.width + x] ?? 0] ?? []);

const backdropAt = ({ width, rgb }: RgbImage, x: number, y: number): string =>
  hexOf([...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]);

const CHECKER_A = darkShade("--checker-a");
const CHECKER_B = darkShade("--checker-b");

// 4×3 : une rangée opaque et vide, une vide, une opaque et vide
const SMALL: CanvasImage = {
  width: 4,
  height: 3,
  state: Uint8Array.from([5, 0, 1, 42, 0, 0, 0, 0, 7, 7, 0, 3]),
};
const filled = (width: number, height: number, colorIndex: number): CanvasImage => ({
  width,
  height,
  state: new Uint8Array(width * height).fill(colorIndex),
});

describe("l'image nette du canvas", () => {
  // Quand le canvas est agrandi à une taille donnée, le système doit en faire une image exactement de cette taille
  it("is exactly the size asked, whole factor or not", () => {
    const bitmap = renderCanvasBitmap(SMALL, 534, 400);

    expect([bitmap.width, bitmap.height]).toEqual([534, 400]);
    expect(bitmap.pixels).toHaveLength(534 * 400);
    expect(renderCanvasBitmap(SMALL, 10, 7).pixels).toHaveLength(70);
  });

  // Quand le facteur n'est pas entier, le système doit remplir la place : les cases se partagent les pixels, au plus proche voisin
  it("fills the place when the factor is not whole: the cells share the pixels, nearest neighbor", () => {
    const bitmap = renderCanvasBitmap({ width: 3, height: 1, state: Uint8Array.from([5, 1, 7]) }, 10, 1);

    expect([0, 3, 4, 6, 7, 9].map((x) => colorAt(bitmap, x, 0))).toEqual([
      PALETTE[5],
      PALETTE[5],
      PALETTE[1],
      PALETTE[1],
      PALETTE[7],
      PALETTE[7],
    ]);
  });

  // Quand une case est agrandie, le système doit en faire un bloc de sa couleur de palette, sans mélange avec sa voisine
  it("turns a cell into a block of its palette color, never blended with its neighbor", () => {
    const bitmap = renderCanvasBitmap(SMALL, 80, 60);

    expect(colorAt(bitmap, 0, 0)).toBe(PALETTE[5]);
    expect(colorAt(bitmap, 19, 19)).toBe(PALETTE[5]);
    expect(colorAt(bitmap, 40, 0)).toBe(PALETTE[1]);
    expect(colorAt(bitmap, 59, 19)).toBe(PALETTE[1]);
    expect(colorAt(bitmap, 60, 0)).toBe(PALETTE[42]);
    expect(colorAt(bitmap, 19, 40)).toBe(PALETTE[7]);
    expect(colorAt(bitmap, 20, 40)).toBe(PALETTE[7]);
    expect(colorAt(bitmap, 79, 59)).toBe(PALETTE[3]);
  });

  // Quand une case est transparente, le système doit y montrer le damier de la page, en cases de 16 pixels, parti du coin
  it("shows the checkerboard of the page on a transparent cell, in tiles of 16 pixels, from the corner", () => {
    const bitmap = renderCanvasBitmap(filled(1, 1, 0), 40, 40);

    expect(colorAt(bitmap, 0, 0)).toBe(CHECKER_A);
    expect(colorAt(bitmap, 15, 15)).toBe(CHECKER_A);
    expect(colorAt(bitmap, 16, 0)).toBe(CHECKER_B);
    expect(colorAt(bitmap, 0, 16)).toBe(CHECKER_B);
    expect(colorAt(bitmap, 16, 16)).toBe(CHECKER_A);
    expect(colorAt(bitmap, 32, 0)).toBe(CHECKER_A);
  });

  // Quand une case vide en jouxte une pleine, le système ne doit pas caler le damier sur les cases : il traverse
  it("does not tie the checkerboard to the cells: it runs across them", () => {
    const bitmap = renderCanvasBitmap({ width: 2, height: 1, state: Uint8Array.from([0, 0]) }, 40, 20);

    expect(colorAt(bitmap, 19, 0)).toBe(CHECKER_B);
    expect(colorAt(bitmap, 20, 0)).toBe(CHECKER_B);
    expect(colorAt(bitmap, 31, 0)).toBe(CHECKER_B);
    expect(colorAt(bitmap, 32, 0)).toBe(CHECKER_A);
  });

  // Si une case porte un index que la palette ne connaît pas, alors le système doit la traiter comme transparente
  it("treats a cell whose index is outside the palette as transparent", () => {
    const bitmap = renderCanvasBitmap(filled(1, 1, 200), 20, 20);

    expect(colorAt(bitmap, 0, 0)).toBe(CHECKER_A);
    expect(colorAt(bitmap, 16, 0)).toBe(CHECKER_B);
  });

  // Quand l'image est écrite, le système doit lui donner une palette sans transparence, de 256 couleurs au plus
  it("gives the image a palette with no transparency, of 256 colors at most", () => {
    const { palette } = renderCanvasBitmap(SMALL, 8, 6);

    expect(palette.length).toBeLessThanOrEqual(256);
    expect(palette).toHaveLength(PALETTE.length + 1);
    for (const color of palette) expect(color.every((channel) => channel >= 0 && channel <= 255)).toBe(true);
    expect(hexOf(palette[PALETTE.length] ?? [])).toBe(CHECKER_B);
  });

  // Quand le canvas est opaque, le système ne doit montrer aucune case du damier
  it("shows no checkerboard tile on a canvas that is fully opaque", () => {
    const bitmap = renderCanvasBitmap(filled(2, 2, 5), 64, 64);
    const seen = new Set<string>();

    for (let y = 0; y < 64; y += 7) for (let x = 0; x < 64; x += 5) seen.add(colorAt(bitmap, x, y));

    expect([...seen]).toEqual([PALETTE[5]]);
  });
});

describe("le fond flou du canvas", () => {
  // Quand le fond est dessiné, le système doit le faire au quart de la carte, que la mise en page agrandit en le lissant
  it("is drawn at a quarter of the size of the card, which the layout enlarges smoothing it", () => {
    const backdrop = renderBackdrop(SMALL);

    expect([backdrop.width, backdrop.height]).toEqual([BACKDROP_WIDTH, BACKDROP_HEIGHT]);
    expect([BACKDROP_WIDTH, BACKDROP_HEIGHT]).toEqual([300, 158]);
    expect(backdrop.rgb).toHaveLength(BACKDROP_WIDTH * BACKDROP_HEIGHT * 3);
  });

  // Quand le canvas n'a qu'une couleur, le système doit remplir tout le fond de cette couleur, bords et coins compris
  it("fills the whole backdrop with the color of a canvas that has only one, edges and corners included", () => {
    const backdrop = renderBackdrop(filled(5, 5, 5));

    for (const [x, y] of [
      [0, 0],
      [BACKDROP_WIDTH - 1, 0],
      [0, BACKDROP_HEIGHT - 1],
      [BACKDROP_WIDTH - 1, BACKDROP_HEIGHT - 1],
      [BACKDROP_WIDTH / 2, BACKDROP_HEIGHT / 2],
    ] as const)
      expect(backdropAt(backdrop, x, y)).toBe(PALETTE[5]);
  });

  // Quand le canvas ne suit pas le format de la carte, le système doit le couvrir en le centrant, quitte à le rogner
  it("covers the card by centering the canvas, cropping it if need be", () => {
    // Trois colonnes de couleurs : la carte, plus large que haute, ne montre qu'une bande de chaque rangée
    const wide: CanvasImage = { width: 3, height: 3, state: Uint8Array.from([5, 5, 5, 1, 1, 1, 7, 7, 7]) };
    const backdrop = renderBackdrop(wide);

    expect(backdropAt(backdrop, BACKDROP_WIDTH / 2, 79)).toBe(PALETTE[1]);
    expect(backdropAt(backdrop, BACKDROP_WIDTH / 2, 1)).toBe(PALETTE[5]);
    expect(backdropAt(backdrop, BACKDROP_WIDTH / 2, BACKDROP_HEIGHT - 2)).toBe(PALETTE[7]);
  });

  // Quand deux couleurs se touchent, le système doit les mélanger sur quelques pixels, et laisser le reste net de flou
  it("blends two colors that touch over a few pixels, and leaves the rest untouched by the blur", () => {
    const halves: CanvasImage = { width: 2, height: 1, state: Uint8Array.from([5, 1]) };
    const backdrop = renderBackdrop(halves);
    const middle = BACKDROP_WIDTH / 2;

    expect(backdropAt(backdrop, 20, 100)).toBe(PALETTE[5]);
    expect(backdropAt(backdrop, BACKDROP_WIDTH - 20, 100)).toBe(PALETTE[1]);
    expect(backdropAt(backdrop, middle - 1, 100)).not.toBe(PALETTE[5]);
    expect(backdropAt(backdrop, middle, 100)).not.toBe(PALETTE[1]);
    expect(backdropAt(backdrop, middle - 12, 100)).toBe(PALETTE[5]);
    expect(backdropAt(backdrop, middle + 12, 100)).toBe(PALETTE[1]);
  });

  // Quand le flou mélange, le système doit passer de l'une à l'autre sans marche : la première moitié du fondu est plus proche de la première couleur
  it("goes from one color to the other with no step: the first half of the blend is closer to the first color", () => {
    const halves: CanvasImage = { width: 2, height: 1, state: Uint8Array.from([42, 1]) };
    const backdrop = renderBackdrop(halves);
    const middle = BACKDROP_WIDTH / 2;
    const red = (x: number): number => backdrop.rgb[(100 * BACKDROP_WIDTH + x) * 3] ?? 0;

    expect(red(middle - 6)).toBeGreaterThan(red(middle - 1));
    expect(red(middle - 1)).toBeGreaterThan(red(middle));
    expect(red(middle)).toBeGreaterThan(red(middle + 6));
  });

  // Quand une case est transparente, le système doit la peindre des teintes du damier, que le flou mêle
  it("paints a transparent cell with the shades of the checkerboard, which the blur mixes", () => {
    const backdrop = renderBackdrop(filled(1, 1, 0));
    const [low, high] = [darkShade("--checker-b"), darkShade("--checker-a")].map((hex) =>
      Number.parseInt(hex.slice(1, 3), 16),
    );
    const red = backdrop.rgb[(79 * BACKDROP_WIDTH + BACKDROP_WIDTH / 2) * 3] ?? 0;

    const green = backdrop.rgb[(79 * BACKDROP_WIDTH + BACKDROP_WIDTH / 2) * 3 + 1] ?? 0;

    expect(red).toBeGreaterThanOrEqual(low ?? 0);
    expect(red).toBeLessThanOrEqual(high ?? 0);
    expect(green).toBeGreaterThanOrEqual(0x21);
    expect(green).toBeLessThanOrEqual(0x28);
  });

  // Quand le canvas est rendu, le système ne doit y poser aucun voile : la page y met le sien
  it("puts no veil on the colors: the page adds its own", () => {
    expect(backdropAt(renderBackdrop(filled(3, 3, 42)), 100, 100)).toBe(PALETTE[42]);
    expect(backdropAt(renderBackdrop(filled(3, 3, 1)), 100, 100)).toBe(PALETTE[1]);
  });
});
