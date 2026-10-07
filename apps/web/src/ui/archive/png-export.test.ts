import { describe, expect, it } from "vitest";
import { pngFileName, pngScale, toPngPixels } from "./png-export";

describe("pngScale (Écart §15, JOURNAL 2026-10-06)", () => {
  // Un facteur entier qui amène le plus grand côté à 1000 cases de pixels au moins
  it("is a whole factor that brings the larger side to 1000 pixels at least", () => {
    expect(pngScale(50, 50)).toBe(20);
    expect(pngScale(64, 36)).toBe(16);
    expect(pngScale(36, 64)).toBe(16);
    expect(pngScale(100, 100)).toBe(10);
    expect(pngScale(200, 200)).toBe(5);
    expect(pngScale(256, 144)).toBe(4);
    expect(pngScale(240, 180)).toBe(5);
  });

  // Jamais moins de 1, et un côté de 1000 ou plus reste à l'échelle de la case
  it("is never under 1, and a side of 1000 or more stays at one pixel per cell", () => {
    expect(pngScale(1000, 10)).toBe(1);
    expect(pngScale(4000, 10)).toBe(1);
  });
});

describe("pngFileName (Écart §15, JOURNAL 2026-10-06)", () => {
  // Lisible : le pseudo, et le jour d'archivage à Paris
  it("is readable: the login, and the archive day in Paris", () => {
    expect(pngFileName("kalyss", Date.UTC(2026, 9, 18, 10))).toBe("liveplace-kalyss-2026-10-18.png");
    expect(pngFileName("kalyss", Date.UTC(2026, 9, 18, 23, 30))).toBe("liveplace-kalyss-2026-10-19.png");
  });
});

describe("toPngPixels (Écart §15, JOURNAL 2026-10-06)", () => {
  const palette = ["#00000000", "#ff0000", "#10203040"];

  // Agrandit chaque case en bloc, au plus proche voisin : aucune couleur intermédiaire
  it("scales each cell into a block, nearest neighbour: no in-between colour", () => {
    const rgba = toPngPixels(Uint8Array.from([1, 0]), 2, 1, palette, 2, "transparent");

    expect(rgba).toHaveLength(4 * 2 * 4);
    const pixelAt = (x: number, y: number) => [...rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      expect(pixelAt(x, y)).toEqual([255, 0, 0, 255]);
    for (const [x, y] of [
      [2, 0],
      [3, 0],
      [2, 1],
      [3, 1],
    ] as const)
      expect(pixelAt(x, y)).toEqual([0, 0, 0, 0]);
  });

  // Les cases transparentes le restent, et un alpha de la palette est gardé
  it("keeps transparent cells transparent, and keeps a palette alpha", () => {
    const rgba = toPngPixels(Uint8Array.from([0, 2]), 2, 1, palette, 1, "transparent");

    expect([...rgba]).toEqual([0, 0, 0, 0, 0x10, 0x20, 0x30, 0x40]);
  });

  // Range les lignes dans l'ordre, sans confondre largeur et hauteur
  it("lays the rows out in order, not mixing width and height", () => {
    const rgba = toPngPixels(Uint8Array.from([1, 0, 0, 1]), 1, 4, palette, 1, "transparent");

    expect([...rgba]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255]);
  });
});

describe("toPngPixels, the background of the download (Écart §15, JOURNAL 2026-10-06)", () => {
  const palette = ["#00000000", "#ff0000", "#10203040"];
  const state = Uint8Array.from([1, 0, 2]); // une case rouge, une vide, une à moitié transparente

  // Noir : la case vide prend #000000 opaque, les cases colorées ne bougent pas, alpha de la palette compris
  it("gives an empty cell opaque black on a black background, leaving the coloured cells alone", () => {
    const rgba = toPngPixels(state, 3, 1, palette, 1, "black");

    expect([...rgba]).toEqual([255, 0, 0, 255, 0, 0, 0, 255, 0x10, 0x20, 0x30, 0x40]);
  });

  // Blanc : la case vide prend #ffffff opaque, les cases colorées ne bougent pas
  it("gives an empty cell opaque white on a white background, leaving the coloured cells alone", () => {
    const rgba = toPngPixels(state, 3, 1, palette, 1, "white");

    expect([...rgba]).toEqual([255, 0, 0, 255, 255, 255, 255, 255, 0x10, 0x20, 0x30, 0x40]);
  });

  // Transparent : comme avant, la case vide reste transparente
  it("leaves an empty cell transparent on a transparent background, as it always was", () => {
    const rgba = toPngPixels(state, 3, 1, palette, 1, "transparent");

    expect([...rgba]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0x10, 0x20, 0x30, 0x40]);
  });

  // Le fond suit l'agrandissement : le bloc entier d'une case vide, au plus proche voisin, comme une case colorée
  it("fills the whole block of an empty cell once enlarged, as it does for a coloured one", () => {
    const rgba = toPngPixels(Uint8Array.from([0, 1]), 2, 1, palette, 2, "white");

    const pixelAt = (x: number, y: number) => [...rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      expect(pixelAt(x, y)).toEqual([255, 255, 255, 255]);
    for (const [x, y] of [
      [2, 0],
      [3, 0],
      [2, 1],
      [3, 1],
    ] as const)
      expect(pixelAt(x, y)).toEqual([255, 0, 0, 255]);
  });
});
