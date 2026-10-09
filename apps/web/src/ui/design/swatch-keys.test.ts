import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSwatchKey, SWATCH_COLUMNS, type SwatchPress, swatchKey } from "./swatch-keys";

const press = (key: string, code = key, hasModifier = false): SwatchPress => ({ key, code, hasModifier });

// La grille de la palette à la souris : la gomme et 42 couleurs, 15 par rangée (15, 15, 13).
const COUNT = 43;
const COLUMNS = SWATCH_COLUMNS.pointer;

const moveTo = (key: string, index: number, count = COUNT, columns = COLUMNS) =>
  swatchKey(press(key), index, count, columns);

describe("swatchKey (JOURNAL 2026-10-09, la palette au clavier)", () => {
  // Gauche et droite vont d'une case, et bouclent d'un bout à l'autre de la grille
  it("moves one swatch with Left and Right, and wraps from one end of the grid to the other", () => {
    expect(moveTo("ArrowRight", 4)).toEqual({ kind: "move", index: 5 });
    expect(moveTo("ArrowLeft", 4)).toEqual({ kind: "move", index: 3 });
    expect(moveTo("ArrowRight", COUNT - 1)).toEqual({ kind: "move", index: 0 });
    expect(moveTo("ArrowLeft", 0)).toEqual({ kind: "move", index: COUNT - 1 });
  });

  // Haut et bas vont d'une rangée, dans la même colonne
  it("moves one row with Up and Down, in the same column", () => {
    expect(moveTo("ArrowDown", 4)).toEqual({ kind: "move", index: 19 });
    expect(moveTo("ArrowUp", 19)).toEqual({ kind: "move", index: 4 });
    expect(moveTo("ArrowDown", 19)).toEqual({ kind: "move", index: 34 });
  });

  // Bas depuis la dernière rangée reboucle en haut de la colonne, haut depuis la première descend en bas de la colonne
  it("wraps Down from the last row to the top of the column, and Up from the first row to the bottom of it", () => {
    expect(moveTo("ArrowDown", 34)).toEqual({ kind: "move", index: 4 });
    expect(moveTo("ArrowUp", 4)).toEqual({ kind: "move", index: 34 });
  });

  // La dernière rangée est plus courte (13 cases) : une colonne qui n'y a pas de case boucle sur la rangée d'au-dessus
  it("wraps within the column when the last row is shorter than the others", () => {
    // Colonne 13 : 13, 28, et pas de 43. Colonne 14 : 14, 29, et pas de 44.
    expect(moveTo("ArrowUp", 13)).toEqual({ kind: "move", index: 28 });
    expect(moveTo("ArrowDown", 28)).toEqual({ kind: "move", index: 13 });
    expect(moveTo("ArrowUp", 14)).toEqual({ kind: "move", index: 29 });
    expect(moveTo("ArrowDown", 29)).toEqual({ kind: "move", index: 14 });
  });

  // Une grille d'une seule rangée garde sa case sur Haut et Bas
  it("stays on the same swatch with Up and Down when the grid has a single row", () => {
    expect(moveTo("ArrowDown", 3, 6, 15)).toEqual({ kind: "move", index: 3 });
    expect(moveTo("ArrowUp", 3, 6, 15)).toEqual({ kind: "move", index: 3 });
  });

  // Au doigt, six colonnes : la même règle
  it("follows the six columns of the touch grid", () => {
    expect(swatchKey(press("ArrowDown"), 2, 42, SWATCH_COLUMNS.touch)).toEqual({ kind: "move", index: 8 });
    expect(swatchKey(press("ArrowUp"), 2, 42, SWATCH_COLUMNS.touch)).toEqual({ kind: "move", index: 38 });
  });

  // Début et Fin vont à la première et à la dernière case
  it("goes to the first and the last swatch with Home and End", () => {
    expect(moveTo("Home", 20)).toEqual({ kind: "move", index: 0 });
    expect(moveTo("End", 20)).toEqual({ kind: "move", index: COUNT - 1 });
  });

  // Entrée et Espace choisissent la couleur du focus et rendent le focus au canvas
  it("chooses the focused color with Enter or Space", () => {
    expect(swatchKey(press("Enter"), 7, COUNT, COLUMNS)).toEqual({ kind: "choose" });
    expect(swatchKey(press(" ", "Space"), 7, COUNT, COLUMNS)).toEqual({ kind: "choose" });
  });

  // Échap rend le focus au canvas
  it("leaves the palette with Escape", () => {
    expect(swatchKey(press("Escape"), 7, COUNT, COLUMNS)).toEqual({ kind: "leave" });
  });

  // Laisse passer Tab et toute autre touche, et ne fait rien d'une case introuvable ou d'une grille vide
  it("lets Tab and any other key through, and does nothing with a swatch it cannot find", () => {
    expect(moveTo("Tab", 7)).toBeNull();
    expect(moveTo("e", 7)).toBeNull();
    expect(moveTo("1", 7)).toBeNull();
    expect(moveTo("ArrowRight", -1)).toBeNull();
    expect(moveTo("ArrowRight", COUNT)).toBeNull();
    expect(moveTo("ArrowRight", 0, 0)).toBeNull();
  });

  // Laisse au navigateur les touches tenues avec Ctrl, Alt ou Cmd
  it("leaves keys held with Ctrl, Alt or Cmd to the browser", () => {
    expect(swatchKey(press("ArrowRight", "ArrowRight", true), 4, COUNT, COLUMNS)).toBeNull();
    expect(swatchKey(press("Enter", "Enter", true), 4, COUNT, COLUMNS)).toBeNull();
    expect(swatchKey(press("Escape", "Escape", true), 4, COUNT, COLUMNS)).toBeNull();
  });
});

describe("isSwatchKey (les touches que la palette garde pour elle)", () => {
  // Les flèches, Début, Fin, Entrée, Espace et Échap sont à la palette tant que le focus y est
  it("keeps the arrows, Home, End, Enter, Space and Escape for the palette", () => {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape"]) {
      expect(isSwatchKey(press(key))).toBe(true);
    }
    expect(isSwatchKey(press(" ", "Space"))).toBe(true);
  });

  // Les autres touches du Dessin (E, I, Retour arrière, chiffres) et Tab ne sont pas à elle
  it("leaves the other draft keys and Tab alone", () => {
    for (const key of ["e", "i", "Backspace", "Delete", "1", "Tab", "d"]) {
      expect(isSwatchKey(press(key))).toBe(false);
    }
  });

  // Ctrl, Alt ou Cmd : la touche appartient au navigateur, pas à la palette
  it("does not keep a key held with Ctrl, Alt or Cmd", () => {
    expect(isSwatchKey(press("ArrowRight", "ArrowRight", true))).toBe(false);
    expect(isSwatchKey(press("Enter", "Enter", true))).toBe(false);
  });
});

describe("les colonnes de la grille", () => {
  // Les colonnes du clavier sont celles que palette.css pose : le CSS et le code ne se contredisent pas
  it("matches the columns that palette.css lays out", () => {
    const css = readFileSync(join(import.meta.dirname, "palette.css"), "utf8");

    expect(css).toContain(`grid-template-columns: repeat(${SWATCH_COLUMNS.pointer}, var(--lp-swatch-size))`);
    expect(css).toContain(`grid-template-columns: repeat(${SWATCH_COLUMNS.touch}, var(--control-size))`);
  });
});
