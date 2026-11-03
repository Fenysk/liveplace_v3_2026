import { describe, expect, it } from "vitest";
import {
  EYEDROPPER_LOOP_MS,
  EYEDROPPER_RESTING_MS,
  eyedropperAt,
  PICK_MUSHROOM_AT,
  PICKED_CELL,
  PICKED_SWATCH,
  START_SWATCH,
  SWATCH_COLOR_INDEXES,
  TOOL_SPOT,
} from "./eyedropper-motion";
import { SCENE_CELL } from "./inspection-scene";
import { motifCells } from "./pixel-motifs";

describe("la pipette (vignette)", () => {
  // L'image fixe : la couleur est prise, la pipette désarmée, le contour du pixel parti
  it("rests on the picked color, with the eyedropper disarmed", () => {
    const moment = eyedropperAt(EYEDROPPER_RESTING_MS);

    expect(moment.chosen).toBe(PICKED_SWATCH);
    expect(moment.isArmed).toBe(false);
    expect(moment.isTool).toBe(false);
    expect(moment.outline).toBe(0);
  });

  // La couleur que la pipette prend est celle du pixel visé, et d'une pastille que la pill montre
  it("takes the very color of the pixel the mouse clicks, which is one of the swatches", () => {
    const cell = motifCells("mushroom", 0, 0).find(({ x, y }) => x === PICKED_CELL.x && y === PICKED_CELL.y);

    expect(cell?.colorIndex).toBe(SWATCH_COLOR_INDEXES[PICKED_SWATCH]);
    expect(SWATCH_COLOR_INDEXES[START_SWATCH]).not.toBe(SWATCH_COLOR_INDEXES[PICKED_SWATCH]);
  });

  // Une pipette armée par un clic, désarmée par le clic sur le pixel : un seul clic
  it("arms the eyedropper with the first click and disarms it with the click on the pixel", () => {
    expect(eyedropperAt(1400).isArmed).toBe(false);
    expect(eyedropperAt(1400).toolTap).toBeLessThan(1);
    expect(eyedropperAt(1500).toolTap).toBe(1);
    expect(eyedropperAt(1600).isArmed).toBe(true);
    expect(eyedropperAt(3100).isArmed).toBe(true);
    expect(eyedropperAt(3250).isArmed).toBe(false);
  });

  // La couleur ne change qu'au clic sur le pixel, pas avant
  it("changes the chosen color with the click on the pixel, not before", () => {
    expect(eyedropperAt(0).chosen).toBe(START_SWATCH);
    expect(eyedropperAt(2800).chosen).toBe(START_SWATCH);
    expect(eyedropperAt(3150).chosen).toBe(START_SWATCH);
    expect(eyedropperAt(3250).chosen).toBe(PICKED_SWATCH);
    expect(eyedropperAt(7000).chosen).toBe(PICKED_SWATCH);
  });

  // La souris est l'icône de la pipette sur la fresque seulement : la flèche sur le bouton, avant et après
  it("shows the eyedropper cursor over the canvas only, the arrow over the button and after the pick", () => {
    expect(eyedropperAt(1600).isTool).toBe(false);
    expect(eyedropperAt(2500).isTool).toBe(true);
    expect(eyedropperAt(3200).isTool).toBe(true);
    expect(eyedropperAt(3400).isTool).toBe(false);
  });

  // La pointe tombe sur le bouton au premier clic, et dans la case rouge au second
  it("puts the tip on the eyedropper button, then inside the red cell, at each click", () => {
    const onTool = eyedropperAt(1500).pointer;
    const onPixel = eyedropperAt(3200).pointer;
    const left = PICK_MUSHROOM_AT.x + PICKED_CELL.x * SCENE_CELL;
    const top = PICK_MUSHROOM_AT.y + PICKED_CELL.y * SCENE_CELL;

    expect([onTool.ax, onTool.ay, onTool.bx, onTool.by]).toEqual([
      TOOL_SPOT.ax,
      TOOL_SPOT.ay,
      TOOL_SPOT.bx,
      TOOL_SPOT.by,
    ]);
    expect(onPixel.ax).toBeGreaterThan(left);
    expect(onPixel.ax).toBeLessThan(left + SCENE_CELL);
    expect(onPixel.ay).toBeGreaterThan(top);
    expect(onPixel.ay).toBeLessThan(top + SCENE_CELL);
    expect(eyedropperAt(1500).press).toBe(1);
    expect(eyedropperAt(3200).press).toBe(1);
  });

  // Le pixel pris s'entoure un instant, puis le contour part
  it("outlines the picked pixel for a moment", () => {
    expect(eyedropperAt(3100).outline).toBe(0);
    expect(eyedropperAt(3400).outline).toBe(1);
    expect(eyedropperAt(4100).outline).toBeGreaterThan(0);
    expect(eyedropperAt(4100).outline).toBeLessThan(1);
    expect(eyedropperAt(4500).outline).toBe(0);
  });

  // La souris part en fondu avant que la couleur d'avant ne revienne, et la boucle se referme sur elle-même
  it("lets the mouse fade out before the first color comes back, and closes the loop on itself", () => {
    expect(eyedropperAt(7600).pointer.opacity).toBeGreaterThan(0);
    expect(eyedropperAt(7600).pointer.opacity).toBeLessThan(1);
    expect(eyedropperAt(7700).chosen).toBe(PICKED_SWATCH);
    expect(eyedropperAt(7900).chosen).toBe(START_SWATCH);
    expect(eyedropperAt(7900).pointer.opacity).toBe(0);
    expect(eyedropperAt(EYEDROPPER_LOOP_MS)).toEqual(eyedropperAt(0));
  });
});
