import { toBase64 } from "@liveplace/shared";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { measureCardTexts, renderCardPng } from "./card-png";
import { encodeIndexedPng } from "./indexed-png";
import { decodePng } from "./png-decoder";

const SIZE = { width: 1200, height: 630 };
const BACKGROUND = [16, 32, 48, 255];

const pixelAt = ({ width, rgba }: { width: number; rgba: Uint8Array }, x: number, y: number): number[] => [
  ...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

const textCard = (fontWeight: number) =>
  createElement(
    "div",
    {
      style: {
        display: "flex",
        width: SIZE.width,
        height: SIZE.height,
        background: "#102030",
        color: "#ffffff",
        fontFamily: "Nunito",
        fontSize: 90,
        fontWeight,
        padding: 40,
      },
    },
    "Viens dessiner",
  );

// Les pixels de la zone du texte qui ne sont pas ceux du fond
const textPixels = (png: Uint8Array): number => {
  const decoded = decodePng(png);
  let count = 0;
  for (let y = 40; y < 200; y++)
    for (let x = 40; x < 900; x++) if (pixelAt(decoded, x, y)[0] !== BACKGROUND[0]) count++;
  return count;
};

describe("le rendu de la carte d'aperçu en PNG", () => {
  // Quand un arbre est rendu, le système doit écrire un PNG de la taille demandée, au fond exact
  it("renders a tree as a PNG of the asked size with the exact background", async () => {
    const decoded = decodePng(await renderCardPng(textCard(900), SIZE));

    expect([decoded.width, decoded.height]).toEqual([1200, 630]);
    expect(pixelAt(decoded, 5, 5)).toEqual(BACKGROUND);
    expect(pixelAt(decoded, 1195, 625)).toEqual(BACKGROUND);
  });

  // Quand un texte est rendu, le système doit le dessiner en Nunito, et chaque graisse doit donner un tracé plus épais
  it("draws text in Nunito, each heavier weight giving a thicker stroke", async () => {
    const [regular, heavy] = [
      await renderCardPng(textCard(700), SIZE),
      await renderCardPng(textCard(900), SIZE),
    ];

    expect(textPixels(regular)).toBeGreaterThan(2_000);
    expect(textPixels(heavy)).toBeGreaterThan(textPixels(regular));
    expect(pixelAt(decodePng(heavy), 0, 0)).toEqual(BACKGROUND);
  });

  // Quand une image est posée à des coordonnées entières à sa taille, le système doit la rendre pixel pour pixel, sans flou
  it("renders an image placed at whole coordinates and at its own size pixel for pixel, with no blur", async () => {
    const squares = encodeIndexedPng({
      width: 4,
      height: 2,
      palette: [
        [255, 0, 0],
        [0, 255, 0],
      ],
      pixels: Uint8Array.from([0, 0, 1, 1, 0, 0, 1, 1]),
    });
    const card = createElement(
      "div",
      { style: { display: "flex", width: SIZE.width, height: SIZE.height, background: "#102030" } },
      createElement("img", {
        src: `data:image/png;base64,${toBase64(squares)}`,
        width: 4,
        height: 2,
        style: { position: "absolute", left: 100, top: 50 },
      }),
    );

    const decoded = decodePng(await renderCardPng(card, SIZE));

    expect(pixelAt(decoded, 100, 50)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(decoded, 101, 51)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(decoded, 102, 50)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(decoded, 103, 51)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(decoded, 99, 50)).toEqual(BACKGROUND);
    expect(pixelAt(decoded, 104, 50)).toEqual(BACKGROUND);
    expect(pixelAt(decoded, 100, 52)).toEqual(BACKGROUND);
  });
});

describe("la mesure des textes de la carte", () => {
  // Quand des textes sont mesurés, le système doit rendre la largeur de chacun à 100 px, dans l'ordre, d'un texte plus long plus large
  it("gives the width of each text at 100 pixels, in order, a longer text being wider", async () => {
    const [short, long, empty] = await measureCardTexts([
      { text: "Fen", fontWeight: 900 },
      { text: "Fenysk le Grand", fontWeight: 900 },
      { text: " ", fontWeight: 900 },
    ]);

    expect(short).toBeGreaterThan(100);
    expect(long).toBeGreaterThan((short ?? 0) * 3);
    expect(empty).toBeLessThan(short ?? 0);
  });

  // Quand la graisse change, le système doit mesurer le texte dans la graisse demandée : la plus lourde est plus large
  it("measures a text in the weight asked, the heavier being wider", async () => {
    const [regular, heavy] = await measureCardTexts([
      { text: "Viens dessiner sur", fontWeight: 700 },
      { text: "Viens dessiner sur", fontWeight: 900 },
    ]);

    expect(heavy).toBeGreaterThan(regular ?? 0);
  });

  // Quand le texte est rendu à une taille, le système doit l'avoir mesuré juste : la largeur mesurée est celle du texte dessiné
  it("measures what is drawn: the measured width is the width of the drawn text", async () => {
    const [measured] = await measureCardTexts([{ text: "Fenysk", fontWeight: 900 }]);
    const card = createElement(
      "div",
      { style: { display: "flex", width: 1200, height: 630, background: "#102030", color: "#ffffff" } },
      createElement(
        "div",
        { style: { display: "flex", fontFamily: "Nunito", fontSize: 100, fontWeight: 900 } },
        "Fenysk",
      ),
    );
    const decoded = decodePng(await renderCardPng(card, SIZE));
    let lastColumn = 0;
    for (let x = 0; x < 600; x++)
      for (let y = 0; y < 150; y++) if (pixelAt(decoded, x, y)[0] !== BACKGROUND[0]) lastColumn = x;

    expect(lastColumn).toBeLessThanOrEqual(measured ?? 0);
    expect(lastColumn).toBeGreaterThan((measured ?? 0) - 20);
  });
});
