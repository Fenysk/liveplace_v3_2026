import { toStateOffset } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { previewResize, toCanvasSize, toSizeChoice, turnOffPreview } from "./canvas-size";

describe("the canvas size (JOURNAL 2026-09-29)", () => {
  // Retrouve le format et la taille d'un canvas, et propose le grand carré à un canvas d'avant les formats
  it("finds a canvas's format and size, and offers the large square to a canvas born before formats", () => {
    expect(toSizeChoice({ width: 128, height: 72 })).toEqual({ format: "16:9", sizeIndex: 1 });
    expect(toSizeChoice({ width: 256, height: 256 })).toEqual({ format: "1:1", sizeIndex: 2 });
    expect(toCanvasSize({ format: "3:4", sizeIndex: 0 })).toEqual({ width: 45, height: 60 });
  });

  // Liste les pixels posés qui sortent du cadre une fois les dessins rapprochés, jamais une case transparente
  // (Écart §5.3, JOURNAL 2026-10-24 : le pixel en (3, 0) se rapproche de l'origine, seul celui en (1, 2) sort)
  it("lists the placed pixels leaving the frame once drawings are brought closer, never a transparent cell", () => {
    const current = { width: 4, height: 3 };
    const pixels = new Uint8Array(12);
    pixels[toStateOffset(0, 0, 4)] = 5;
    pixels[toStateOffset(3, 0, 4)] = 6;
    pixels[toStateOffset(1, 2, 4)] = 7;

    expect(previewResize(pixels, current, { width: 3, height: 2 }).outside).toEqual([
      { x: 1, y: 2, colorIndex: 7 },
    ]);
    expect(previewResize(pixels, current, { width: 5, height: 5 }).outside).toEqual([]);
  });

  // Dit si des dessins se rapprochent : un pixel qui change de case, pas une simple coupe
  it("says whether drawings come closer: a pixel changing cell, not a plain trim", () => {
    const current = { width: 8, height: 2 };
    const pixels = new Uint8Array(16);
    pixels[toStateOffset(0, 0, 8)] = 5;
    pixels[toStateOffset(6, 0, 8)] = 6;

    expect(previewResize(pixels, current, { width: 4, height: 2 }).hasMovedPixels).toBe(true);
    expect(previewResize(pixels, current, { width: 8, height: 1 }).hasMovedPixels).toBe(false);
    expect(previewResize(pixels, current, { width: 16, height: 4 }).hasMovedPixels).toBe(false);
  });
});

describe("turning the dynamic size off (Écart §5.3, JOURNAL 2026-10-29)", () => {
  // Retirer la taille dynamique ramène la fresque à 50 × 50 comme un choix de Petit carré : les dessins se rapprochent d'abord (le vide
  // de 4 colonnes entre eux perd 3 colonnes, il en garde une), puis la coupe prend les 7 colonnes qui dépassent encore, à leur place d'aujourd'hui
  it("brings drawings closer before cutting what still does not fit, like a manual choice of 50 × 50", () => {
    const current = { width: 60, height: 20 };
    const pixels = new Uint8Array(60 * 20);
    for (let x = 0; x < 28; x++) pixels[toStateOffset(x, 10, 60)] = 5;
    for (let x = 32; x < 60; x++) pixels[toStateOffset(x, 10, 60)] = 6;

    const preview = turnOffPreview(pixels, current);

    expect(preview).toEqual(previewResize(pixels, current, { width: 50, height: 50 }));
    expect(preview.hasMovedPixels).toBe(true);
    expect(preview.outside).toEqual([53, 54, 55, 56, 57, 58, 59].map((x) => ({ x, y: 10, colorIndex: 6 })));
  });

  // Une fresque dont les dessins tiennent dans 50 × 50 : rien ne sort, la section n'ouvre aucune confirmation
  it("leaves nothing outside the frame when the drawings fit in 50 × 50, and a small canvas just grows", () => {
    const small = { width: 12, height: 12 };
    const pixels = new Uint8Array(12 * 12);
    pixels[toStateOffset(0, 0, 12)] = 5;
    pixels[toStateOffset(11, 11, 12)] = 6;

    expect(turnOffPreview(pixels, small)).toEqual({ outside: [], hasMovedPixels: false });
  });
});
