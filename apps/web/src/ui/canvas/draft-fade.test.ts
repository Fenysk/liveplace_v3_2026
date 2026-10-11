import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Draft } from "../../state/draft";
import { draftFadeStarts, MAX_DRAFT_FADES } from "./draft-fade";

const draftOf = (...pixels: { x: number; y: number; colorIndex: number }[]): Draft =>
  new Map(pixels.map((pixel) => [toCellKey(pixel.x, pixel.y), pixel]));

const RED = { x: 1, y: 1, colorIndex: 5 };
const BLUE = { x: 2, y: 1, colorIndex: 28 };

describe("draftFadeStarts (la case qui entre au brouillon)", () => {
  // Une case ajoutée entre en fondu depuis rien, et les cases d'avant ne bougent pas
  it("starts a fade for an added cell from nothing, and leaves the cells of before alone", () => {
    expect(draftFadeStarts(draftOf(RED), draftOf(RED, BLUE), MAX_DRAFT_FADES)).toEqual([
      { key: toCellKey(2, 1), from: null },
    ]);
  });

  // Une gomme ajoutée entre en fondu comme une couleur
  it("starts a fade for an added eraser like for a color", () => {
    const eraser = { x: 3, y: 1, colorIndex: 0 };
    expect(draftFadeStarts(draftOf(), draftOf(eraser), MAX_DRAFT_FADES)).toEqual([
      { key: toCellKey(3, 1), from: null },
    ]);
  });

  // Une case repeinte d'une autre couleur part de l'ancienne
  it("starts a fade from the old color for a cell repainted another color", () => {
    const repainted = { ...RED, colorIndex: 28 };
    expect(draftFadeStarts(draftOf(RED), draftOf(repainted), MAX_DRAFT_FADES)).toEqual([
      { key: toCellKey(1, 1), from: 5 },
    ]);
  });

  // Une case retirée, ou rien de changé : aucun fondu
  it("starts nothing for a removed cell, nor when nothing changed", () => {
    expect(draftFadeStarts(draftOf(RED, BLUE), draftOf(RED), MAX_DRAFT_FADES)).toEqual([]);
    expect(draftFadeStarts(draftOf(RED, BLUE), draftOf(RED, BLUE), MAX_DRAFT_FADES)).toEqual([]);
    expect(draftFadeStarts(draftOf(RED), draftOf(), MAX_DRAFT_FADES)).toEqual([]);
  });

  // Au-delà de la place restante, les cases suivantes paraissent d'un coup : seules les premières entrent en fondu
  it("starts at most the room that is left, the first cells in the draft order", () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ x: index, y: 0, colorIndex: 5 }));

    expect(draftFadeStarts(draftOf(), draftOf(...many), 3).map(({ key }) => key)).toEqual(
      many.slice(0, 3).map(({ x, y }) => toCellKey(x, y)),
    );
    expect(draftFadeStarts(draftOf(), draftOf(...many), 0)).toEqual([]);
  });

  // Le plafond est de 200 cases en fondu à la fois
  it("caps the fades at 200 at once", () => {
    expect(MAX_DRAFT_FADES).toBe(200);
  });
});
