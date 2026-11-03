import { describe, expect, it } from "vitest";
import {
  KEY_NAMES,
  KEY_STEPS,
  KEYBOARD_LOOP_MS,
  KEYBOARD_RESTING_MS,
  keyboardAt,
  PIXEL_CELLS,
  START_CELL,
} from "./keyboard-motion";

describe("Dessiner au clavier (vignette)", () => {
  // L'image fixe : les quatre pixels dessinés et visibles, la case visée à côté du dernier, aucune touche enfoncée
  it("rests with the four pixels drawn, the aimed cell next to the last one and no key pressed", () => {
    const moment = keyboardAt(KEYBOARD_RESTING_MS);

    expect(moment.pixels).toEqual([1, 1, 1, 1]);
    expect(moment.outline).toBe(1);
    expect(moment.target).toEqual({ x: 5, y: 0 });
    expect(PIXEL_CELLS).not.toContainEqual(moment.target);
    expect(KEY_NAMES.map((key) => moment.pressed[key])).toEqual([0, 0, 0, 0, 0]);
  });

  // Chaque flèche déplace la case visée d'une case, dans son sens, au moment où sa touche s'allume
  it("moves the aimed cell by one cell per arrow, when its key lights up", () => {
    expect(keyboardAt(1000).target).toEqual(START_CELL);
    expect(keyboardAt(1100).target).toEqual({ x: 1, y: 0 });
    expect(keyboardAt(1100).pressed.left).toBe(1);
    expect(keyboardAt(1480).target).toEqual({ x: 0, y: 0 });
    expect(keyboardAt(2830).target).toEqual({ x: 1, y: 1 });
    expect(keyboardAt(2830).pressed.down).toBe(1);
    expect(keyboardAt(5010).target).toEqual({ x: 3, y: 0 });
    expect(keyboardAt(5010).pressed.up).toBe(1);
  });

  // Espace allume sa touche et ajoute la case visée, sans la déplacer ; les pixels ne paraissent qu'à Espace
  it("adds the aimed cell with Space, which does not move it", () => {
    expect(keyboardAt(1850).pixels).toEqual([0, 0, 0, 0]);
    expect(keyboardAt(1900).pressed.space).toBe(1);
    expect(keyboardAt(1900).pixels).toEqual([1, 0, 0, 0]);
    expect(keyboardAt(1900).target).toEqual(keyboardAt(1850).target);
    expect(keyboardAt(3280).pixels).toEqual([1, 1, 0, 0]);
    expect(keyboardAt(4180).pixels).toEqual([1, 1, 1, 0]);
    expect(keyboardAt(5430).pixels).toEqual([1, 1, 1, 1]);
  });

  // Les quatre pixels dessinent un sourire : deux au bord de la rangée du haut, deux au milieu de celle du bas
  it("draws a small smile with the four pixels", () => {
    expect(PIXEL_CELLS).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 0 },
    ]);
  });

  // Les quatre flèches et Espace servent chacune au moins une fois : toutes s'allument dans la boucle
  it("uses every arrow and Space at least once", () => {
    for (const key of KEY_NAMES) expect(KEY_STEPS.some((step) => step.key === key)).toBe(true);
  });

  // Tout part en fondu avant que la boucle reparte, et la case visée revient à son départ
  it("fades everything out, then restarts from the first cell", () => {
    expect(keyboardAt(7550).pixels.every((opacity) => opacity > 0 && opacity < 1)).toBe(true);
    expect(keyboardAt(7900).pixels).toEqual([0, 0, 0, 0]);
    expect(keyboardAt(7900).outline).toBe(0);
    expect(keyboardAt(KEYBOARD_LOOP_MS + 1000).target).toEqual(START_CELL);
    expect(keyboardAt(KEYBOARD_LOOP_MS + 3000)).toEqual(keyboardAt(3000));
  });

  // La case visée paraît en fondu avant la première touche
  it("shows the aimed cell before the first key", () => {
    expect(keyboardAt(0).outline).toBe(0);
    expect(keyboardAt(1000).outline).toBe(1);
  });
});
