import { describe, expect, it } from "vitest";
import {
  CLEAR_RESTING_MS,
  INSPECTION_ANCHOR,
  INSPECTION_LOOP_MS,
  inspectionAt,
  REPORT_RESTING_MS,
  WINDOW_ANCHOR,
} from "./inspection-motion";
import { INSPECTED_SPOT } from "./inspection-scene";

describe("Signaler et Effacer, le même parcours (vignettes)", () => {
  // Dans l'ordre de l'interface : la case, la pill, la fenêtre, puis le clic qui confirme
  it("goes through the cell, the pill and the window in the order of the interface", () => {
    for (const kind of ["report", "clear"] as const) {
      expect(inspectionAt(kind, 1000).ring).toBe(0);
      expect(inspectionAt(kind, 1400).pill).toBe(0);
      expect(inspectionAt(kind, 1700).ring).toBe(1);
      expect(inspectionAt(kind, 2500).pill).toBe(1);
      expect(inspectionAt(kind, 2900).window).toBe(0);
      expect(inspectionAt(kind, 3600).window).toBe(1);
      expect(inspectionAt(kind, 4800).window).toBe(1);
      expect(inspectionAt(kind, 5200).window).toBe(0);
    }
  });

  // La pointe tombe sur la case, sur le bouton de la pill, puis sur celui de la fenêtre, à chaque clic
  it("puts the tip on the cell, on the pill button, then on the window button, at each click", () => {
    for (const kind of ["report", "clear"] as const) {
      const onCell = inspectionAt(kind, 1500).pointer;
      const onRow = inspectionAt(kind, 3000).pointer;
      const onConfirm = inspectionAt(kind, 4650).pointer;

      expect([onCell.ax, onCell.ay, onCell.bx, onCell.by]).toEqual([
        INSPECTED_SPOT.ax,
        INSPECTED_SPOT.ay,
        0,
        0,
      ]);
      expect([onRow.ax, onRow.ay]).toEqual([INSPECTION_ANCHOR.ax, INSPECTION_ANCHOR.ay]);
      expect([onConfirm.ax, onConfirm.ay, onConfirm.bx, onConfirm.by]).toEqual([
        WINDOW_ANCHOR.ax,
        WINDOW_ANCHOR.ay,
        13.4,
        7.5,
      ]);
      expect(inspectionAt(kind, 1500).press).toBe(1);
      expect(inspectionAt(kind, 3000).rowTap).toBe(1);
      expect(inspectionAt(kind, 4800).confirmTap).toBe(1);
    }
    expect(inspectionAt("report", 3000).pointer.bx).toBe(-31.4);
    expect(inspectionAt("clear", 3000).pointer.bx).toBe(-27.8);
  });

  // La souris est là avant son premier clic et part avec tout le reste
  it("shows the mouse before its first click and fades it out with everything else", () => {
    expect(inspectionAt("report", 0).pointer.opacity).toBe(0);
    expect(inspectionAt("report", 1000).pointer.opacity).toBe(1);
    expect(inspectionAt("report", 7600).pointer.opacity).toBeGreaterThan(0);
    expect(inspectionAt("report", 7600).pointer.opacity).toBeLessThan(1);
    expect(inspectionAt("report", 7900).pointer.opacity).toBe(0);
  });
});

describe("Signaler (vignette)", () => {
  // Signaler ne retire rien : le gribouillis reste, le bouton dit « Signalé » et le toast paraît à la confirmation
  it("keeps the scribble, then says Reported with a toast once confirmed", () => {
    expect(inspectionAt("report", 4700).isDone).toBe(false);
    expect(inspectionAt("report", 4700).toast).toBe(0);
    expect(inspectionAt("report", 5400).isDone).toBe(true);
    expect(inspectionAt("report", 5400).toast).toBe(1);
    for (let time = 0; time < INSPECTION_LOOP_MS; time += 100) {
      expect(inspectionAt("report", time).scribble).toBe(1);
    }
  });

  // L'image fixe : le moment qui suit la confirmation, la fenêtre fermée
  it("rests on the moment after the confirmation, with the window closed", () => {
    const moment = inspectionAt("report", REPORT_RESTING_MS);

    expect(moment.isDone).toBe(true);
    expect(moment.toast).toBe(1);
    expect(moment.pill).toBe(1);
    expect(moment.window).toBe(0);
  });

  // Le bouton et le toast repartent avec la boucle, qui se referme sur elle-même
  it("goes back to Report with the loop, which closes on itself", () => {
    expect(inspectionAt("report", 7900).isDone).toBe(false);
    expect(inspectionAt("report", 7900).toast).toBe(0);
    expect(inspectionAt("report", INSPECTION_LOOP_MS)).toEqual(inspectionAt("report", 0));
  });
});

describe("Effacer (vignette)", () => {
  // La modération ne s'anime jamais : le gribouillis disparaît d'un coup à la confirmation, sans fondu
  it("removes the scribble in one step at the confirmation, never with a fade", () => {
    expect(inspectionAt("clear", 4800).scribble).toBe(1);
    expect(inspectionAt("clear", 4880).scribble).toBe(0);
    expect(inspectionAt("clear", 5000).scribble).toBe(0);
    expect(inspectionAt("clear", 7000).scribble).toBe(0);
  });

  // Il n'y a ni toast ni « Signalé » ici ; le gribouillis revient en fondu quand tout est reparti, hors de la vue
  it("has no toast, and brings the scribble back with a fade once everything is gone", () => {
    expect(inspectionAt("clear", 5400).toast).toBe(0);
    expect(inspectionAt("clear", 5400).isDone).toBe(false);
    expect(inspectionAt("clear", 8000).scribble).toBeGreaterThan(0);
    expect(inspectionAt("clear", 8000).scribble).toBeLessThan(1);
    expect(inspectionAt("clear", 7900).pill).toBe(0);
    expect(inspectionAt("clear", INSPECTION_LOOP_MS)).toEqual(inspectionAt("clear", 0));
  });

  // L'image fixe : le gribouillis est parti, l'Inspection reste ouverte
  it("rests with the scribble gone and the Inspection still open", () => {
    const moment = inspectionAt("clear", CLEAR_RESTING_MS);

    expect(moment.scribble).toBe(0);
    expect(moment.pill).toBe(1);
    expect(moment.window).toBe(0);
  });
});
