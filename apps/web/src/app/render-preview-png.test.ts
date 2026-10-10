import { PALETTE } from "@liveplace/domain";
import type { CanvasImage } from "@liveplace/domain/ports";
import { toBase64 } from "@liveplace/shared";
import { describe, expect, it } from "vitest";
import { encodeIndexedPng } from "../infra/indexed-png";
import { type DecodedPng, decodePng } from "../infra/png-decoder";
import { darkShade } from "../ui/design/dark-shade";
import type { PreviewInput } from "../usecase/canvas-preview";
import { createPreviewRenderer } from "./render-preview-png";

// 4×3 : le canvas prend 656×492 à (48, 69), le panneau 400×534 à (752, 48) ; sa première case est opaque, la deuxième vide
const SMALL: CanvasImage = {
  width: 4,
  height: 3,
  state: Uint8Array.from([5, 0, 1, 42, 0, 0, 0, 0, 7, 7, 0, 3]),
};
const [CANVAS_LEFT, CANVAS_TOP, CANVAS_WIDTH, CANVAS_HEIGHT] = [48, 69, 656, 492];
const [PANEL_LEFT, PANEL_TOP, PANEL_WIDTH, PANEL_HEIGHT] = [752, 48, 400, 534];

const PHOTO_URL = "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk.png";
// Une photo d'un vert que rien d'autre ne porte sur la carte
const PHOTO = `data:image/png;base64,${toBase64(
  encodeIndexedPng({ width: 2, height: 2, palette: [[0, 255, 0]], pixels: new Uint8Array(4) }),
)}`;

const owner = { displayName: "Fenysk", login: "fenysk", avatarUrl: PHOTO_URL };
const input = (overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  image: SMALL,
  owner,
  theme: "Été",
  ...overrides,
});

const render = async (photo: string | null, preview: PreviewInput) => {
  const asked: string[] = [];
  const renderer = createPreviewRenderer({
    photos: {
      get: async (url) => {
        asked.push(url);
        return photo;
      },
    },
  });
  const png = await renderer(preview);
  return { png, decoded: decodePng(png), asked };
};

const rgbOf = (hex: string): number[] =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
const opaque = (hex: string): number[] => [...rgbOf(hex), 255];

const pixelAt = ({ width, rgba }: DecodedPng, x: number, y: number): number[] => [
  ...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

// Les pixels de la zone qui ont exactement cette couleur
const countIn = (
  { width, rgba }: DecodedPng,
  [left, top, right, bottom]: readonly [number, number, number, number],
  color: number[],
): number => {
  let count = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const at = (y * width + x) * 4;
      if (color.every((channel, index) => rgba[at + index] === channel)) count++;
    }
  return count;
};

const PANEL_ZONE = [PANEL_LEFT, PANEL_TOP, PANEL_LEFT + PANEL_WIDTH, PANEL_TOP + PANEL_HEIGHT] as const;
const GREEN = [0, 255, 0, 255];

describe("l'image d'aperçu d'un canvas, « F · Ambiance »", () => {
  // Quand le canvas est rendu, le système doit écrire un PNG de 1200 × 630 avec le texte, la photo et le canvas
  it("renders a PNG of 1200 by 630 with the text, the photo and the canvas", async () => {
    const { decoded } = await render(PHOTO, input());

    expect([decoded.width, decoded.height]).toEqual([1200, 630]);
    expect(countIn(decoded, PANEL_ZONE, GREEN)).toBeGreaterThan(3_000);
    expect(countIn(decoded, PANEL_ZONE, opaque(darkShade("--ink")))).toBeGreaterThan(1_500);
    expect(pixelAt(decoded, CANVAS_LEFT, CANVAS_TOP)).toEqual(opaque(PALETTE[5]));
  });

  // Quand le canvas est posé, le système doit le garder net : chaque case en bloc de sa couleur, le contour à l'unité près
  it("keeps the canvas sharp: each cell a block of its color, the outline to the pixel", async () => {
    const { decoded } = await render(PHOTO, input());
    const ink = opaque(darkShade("--ink"));
    const [right, bottom] = [CANVAS_LEFT + CANVAS_WIDTH - 1, CANVAS_TOP + CANVAS_HEIGHT - 1];

    expect(pixelAt(decoded, CANVAS_LEFT + 163, CANVAS_TOP)).toEqual(opaque(PALETTE[5]));
    expect(pixelAt(decoded, CANVAS_LEFT + 164, CANVAS_TOP)).toEqual(opaque(darkShade("--checker-a")));
    expect(pixelAt(decoded, CANVAS_LEFT + 176, CANVAS_TOP)).toEqual(opaque(darkShade("--checker-b")));
    expect(pixelAt(decoded, CANVAS_LEFT + 328, CANVAS_TOP)).toEqual(opaque(PALETTE[1]));
    expect(pixelAt(decoded, right, bottom)).toEqual(opaque(PALETTE[3]));
    expect(pixelAt(decoded, CANVAS_LEFT - 1, CANVAS_TOP + 100)).toEqual(ink);
    expect(pixelAt(decoded, CANVAS_LEFT - 2, CANVAS_TOP + 100)).toEqual(ink);
    expect(pixelAt(decoded, CANVAS_LEFT - 3, CANVAS_TOP + 100)).not.toEqual(ink);
    expect(pixelAt(decoded, right + 1, bottom + 1)).toEqual(ink);
    expect(pixelAt(decoded, right + 3, bottom + 3)).not.toEqual(ink);
  });

  // Quand le panneau est posé, le système doit lui donner sa place au pixel près : fond, bordure de 2 px, et rien au-delà
  it("gives the panel its place to the pixel: background, a border of 2 pixels, and nothing beyond", async () => {
    const { decoded } = await render(PHOTO, input());
    const middle = PANEL_TOP + 300;
    const [right, bottom] = [PANEL_LEFT + PANEL_WIDTH - 1, PANEL_TOP + PANEL_HEIGHT - 1];
    const border = opaque(darkShade("--pill-border"));

    expect(pixelAt(decoded, PANEL_LEFT, middle)).toEqual(border);
    expect(pixelAt(decoded, PANEL_LEFT + 1, middle)).toEqual(border);
    expect(pixelAt(decoded, PANEL_LEFT + 2, middle)).toEqual(opaque(darkShade("--pill-surface")));
    expect(pixelAt(decoded, PANEL_LEFT - 1, middle)).not.toEqual(border);
    expect(pixelAt(decoded, right, middle)).toEqual(border);
    expect(pixelAt(decoded, right + 1, middle)).not.toEqual(border);
    expect(pixelAt(decoded, PANEL_LEFT + 200, bottom)).toEqual(border);
    expect(pixelAt(decoded, PANEL_LEFT + 200, PANEL_TOP)).toEqual(border);
  });

  // Quand le fond est posé, le système doit y mettre le canvas flou sous un voile du vide à 80 %
  it("puts the blurred canvas under a veil of the void at 80 percent as the backdrop", async () => {
    const { decoded } = await render(PHOTO, input());
    const [red, green, blue] = pixelAt(decoded, 5, 5);
    const [voidRed, voidGreen, voidBlue] = rgbOf(darkShade("--void"));
    const [cellRed, cellGreen, cellBlue] = rgbOf(PALETTE[5]);

    expect(red).toBeCloseTo(0.8 * (voidRed ?? 0) + 0.2 * (cellRed ?? 0), -1);
    expect(green).toBeCloseTo(0.8 * (voidGreen ?? 0) + 0.2 * (cellGreen ?? 0), -1);
    expect(blue).toBeCloseTo(0.8 * (voidBlue ?? 0) + 0.2 * (cellBlue ?? 0), -1);
    expect(pixelAt(decoded, 5, 5)[3]).toBe(255);
  });

  // Si la photo manque ou ne charge pas, alors le système doit dessiner l'initiale du pseudo dans un rond, comme le design system
  it("draws the initial of the name in a disc when the photo is missing or does not load", async () => {
    const { decoded } = await render(null, input());

    expect(countIn(decoded, PANEL_ZONE, GREEN)).toBe(0);
    expect(countIn(decoded, PANEL_ZONE, opaque(darkShade("--chip")))).toBeGreaterThan(2_000);
  });

  // Quand le streamer a une photo, le système doit la demander à son adresse, et ne rien demander s'il n'en a pas
  it("asks for the photo at its address, and asks for nothing when there is none", async () => {
    const withPhoto = await render(PHOTO, input());
    const { avatarUrl: _avatarUrl, ...withoutAddress } = owner;
    const noAddress = await render(PHOTO, input({ owner: withoutAddress }));

    expect(withPhoto.asked).toEqual([PHOTO_URL]);
    expect(noAddress.asked).toEqual([]);
    expect(countIn(noAddress.decoded, PANEL_ZONE, GREEN)).toBe(0);
  });

  // Si le canvas n'a pas de thème, alors le système ne doit écrire ni « Thème » ni le thème, et centrer le reste
  it("writes neither the caption nor a theme when the canvas has none", async () => {
    const { decoded: withTheme } = await render(PHOTO, input());
    const { theme: _theme, ...withoutThemeInput } = input();
    const { decoded: withoutTheme } = await render(PHOTO, withoutThemeInput);
    const top = [PANEL_LEFT + 40, PANEL_TOP + 40, PANEL_LEFT + PANEL_WIDTH - 40, PANEL_TOP + 90] as const;
    const muted = opaque(darkShade("--muted"));

    expect(countIn(withTheme, top, muted)).toBeGreaterThan(100);
    expect(countIn(withoutTheme, top, muted)).toBe(0);
  });

  // Si le pseudo est trop long pour la ligne, alors le système ne doit laisser aucun de ses pixels sortir du texte du panneau
  it("lets no pixel of a very long name leave the text of the panel", async () => {
    const long = { ...owner, displayName: "UnPseudoVraimentTresLongX", login: "unpseudovraimenttreslongx" };
    const { decoded } = await render(PHOTO, input({ owner: long }));
    const strip = [
      PANEL_LEFT + PANEL_WIDTH - 40,
      PANEL_TOP + 40,
      PANEL_LEFT + PANEL_WIDTH - 2,
      PANEL_TOP + 480,
    ] as const;

    expect(countIn(decoded, strip, opaque(darkShade("--ink")))).toBe(0);
    expect(countIn(decoded, strip, opaque(darkShade("--muted")))).toBe(0);
  });

  // Si le pseudo a des lettres que la police ne couvre pas, alors le système doit écrire le login, comme s'il était le pseudo
  it("writes the login, as if it were the name, when the name has letters the font does not cover", async () => {
    const japanese = await render(
      PHOTO,
      input({ owner: { ...owner, displayName: "ゆうき", login: "yuuki" } }),
    );
    const plain = await render(PHOTO, input({ owner: { ...owner, displayName: "yuuki", login: "yuuki" } }));

    expect(Buffer.from(japanese.png).equals(Buffer.from(plain.png))).toBe(true);
  });
});

// Les lignes de pixels d'une zone qui portent cette couleur, regroupées en lignes de texte : [première, dernière] de chaque
const textLines = (
  { width, rgba }: DecodedPng,
  [left, top, right, bottom]: readonly [number, number, number, number],
  color: number[],
): [number, number][] => {
  const lines: [number, number][] = [];
  for (let y = top; y < bottom; y++) {
    let hasColor = false;
    for (let x = left; x < right && !hasColor; x++) {
      const at = (y * width + x) * 4;
      hasColor = color.every((channel, index) => rgba[at + index] === channel);
    }
    const last = lines.at(-1);
    if (hasColor && last && last[1] === y - 1) last[1] = y;
    else if (hasColor) lines.push([y, y]);
  }
  return lines;
};

// Le thème sur le panneau étroit de SMALL : « Thème » à gauche (x 794), le thème à sa droite (x 866 à 1110), dès y 90
const CAPTION_ZONE = [794, 90, 858, 150] as const;
const THEME_ZONE = [866, 90, 1110, 200] as const;
// Des mots sans lettre qui descende : le bas des lignes est leur ligne de base
const TWO_LINES = "Un chat dans la nuit noire en été";
const LONG_THEME = "Un chat géant qui danse sur la lune rose"; // 40 caractères

describe("le thème de l'image d'aperçu", () => {
  // Quand le thème revient à la ligne, le système doit lui donner un interligne de 1,25 : 30 px pour du 24 px
  it("gives a theme that wraps a line height of 1.25: 30 pixels for 24 pixels", async () => {
    const { decoded } = await render(PHOTO, input({ theme: TWO_LINES }));

    const lines = textLines(decoded, THEME_ZONE, opaque(darkShade("--ink")));

    expect(lines).toHaveLength(2);
    expect((lines[1]?.[1] ?? 0) - (lines[0]?.[1] ?? 0)).toBe(30);
  });

  // Quand le thème est écrit, le système doit aligner « Thème » sur la première ligne, à la même ligne de base
  it("aligns the caption on the first line of the theme, on the same baseline", async () => {
    const { decoded } = await render(PHOTO, input({ theme: TWO_LINES }));

    const [caption] = textLines(decoded, CAPTION_ZONE, opaque(darkShade("--muted")));
    const [first] = textLines(decoded, THEME_ZONE, opaque(darkShade("--ink")));

    expect(caption).toBeDefined();
    expect(Math.abs((caption?.[1] ?? 0) - (first?.[1] ?? 99))).toBeLessThanOrEqual(0);
  });

  // Si le thème prend trois lignes ou plus, alors le système doit le couper à la fin de la deuxième, sans toucher au reste
  it("cuts a theme of three lines or more at the end of the second, leaving the rest where it was", async () => {
    const { decoded: cut } = await render(PHOTO, input({ theme: LONG_THEME }));
    const { decoded: twoLines } = await render(PHOTO, input({ theme: TWO_LINES }));
    const lower = [
      PANEL_LEFT + 2,
      PANEL_TOP + 150,
      PANEL_LEFT + PANEL_WIDTH - 2,
      PANEL_TOP + PANEL_HEIGHT - 2,
    ] as const;

    expect(textLines(cut, THEME_ZONE, opaque(darkShade("--ink")))).toHaveLength(2);
    expect(textLines(cut, [866, 150, 1110, 200], opaque(darkShade("--ink")))).toHaveLength(0);
    expect(countIn(cut, lower, opaque(darkShade("--ink")))).toBe(
      countIn(twoLines, lower, opaque(darkShade("--ink"))),
    );
  });

  // Quand le thème est coupé, le système doit y mettre « … » : la fin de la deuxième ligne n'est pas celle du thème
  it("ends a cut theme with an ellipsis: the end of the second line is not the end of the theme", async () => {
    const { decoded: cut } = await render(PHOTO, input({ theme: LONG_THEME }));
    const { decoded: wide } = await render(PHOTO, input({ theme: "Un chat géant qui danse sur" }));
    const end = [1000, 124, 1110, 156] as const;

    expect(countIn(cut, end, opaque(darkShade("--ink")))).toBeGreaterThan(0);
    expect(countIn(cut, end, opaque(darkShade("--ink")))).not.toBe(
      countIn(wide, end, opaque(darkShade("--ink"))),
    );
  });
});
