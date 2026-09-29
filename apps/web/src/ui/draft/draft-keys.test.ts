import { describe, expect, it } from "vitest";
import { type KeyPress, keyCommand, targetStep } from "./draft-keys";

const press = (key: string, code: string, hasModifier = false, isShifted = false): KeyPress => ({
  key,
  code,
  hasModifier,
  isShifted,
});

describe("keyCommand (CDC 2026, raccourcis)", () => {
  // Entre en Dessin par D, Entrée ou Espace, en minuscule comme en majuscule
  it("enters draft mode with D, Enter or Space, lowercase or uppercase", () => {
    expect(keyCommand(press("d", "KeyD"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press("D", "KeyD"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press("Enter", "Enter"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press(" ", "Space"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press(" ", "Space"), "inspecting")).toBe("enterDraftMode");
  });

  // En Dessin, Entrée valide, Échap sort, E bascule la gomme, Espace trace
  it("in draft mode, Enter submits, Escape leaves, E toggles the eraser, Space traces", () => {
    expect(keyCommand(press("Enter", "Enter"), "draft")).toBe("submit");
    expect(keyCommand(press("Escape", "Escape"), "draft")).toBe("exitDraftMode");
    expect(keyCommand(press("e", "KeyE"), "draft")).toBe("toggleEraser");
    expect(keyCommand(press(" ", "Space"), "draft")).toBe("startTrace");
  });

  // En Dessin seulement, I arme la pipette (CDC 2026)
  it("arms the picker with I, in draft mode only", () => {
    expect(keyCommand(press("i", "KeyI"), "draft")).toBe("togglePicker");
    expect(keyCommand(press("I", "KeyI"), "draft")).toBe("togglePicker");
    expect(keyCommand(press("i", "KeyI"), "view")).toBeNull();
  });

  // Lit les lettres par la touche tapée, pas par sa place : sur un clavier AZERTY, D reste D
  it("reads letters by the typed key, not its position: on AZERTY, D stays D", () => {
    expect(keyCommand(press("d", "KeyQ"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press("q", "KeyD"), "view")).toBeNull();
  });

  // Ne fait rien des touches du Dessin en Vue, ni de D en Dessin, et Espace ne valide jamais
  it("does nothing with draft keys in view mode, nor with D in draft mode, and Space never submits", () => {
    expect(keyCommand(press("e", "KeyE"), "view")).toBeNull();
    expect(keyCommand(press(" ", "Space"), "draft")).not.toBe("submit");
    expect(keyCommand(press("Escape", "Escape"), "view")).toBeNull();
    expect(keyCommand(press("d", "KeyD"), "draft")).toBeNull();
  });

  // Pendant une inspection, Échap la ferme, et D ou Entrée entrent toujours en Dessin
  it("while inspecting, Escape closes the inspection, and D or Enter still enter draft mode", () => {
    expect(keyCommand(press("Escape", "Escape"), "inspecting")).toBe("closeInspection");
    expect(keyCommand(press("d", "KeyD"), "inspecting")).toBe("enterDraftMode");
    expect(keyCommand(press("Enter", "Enter"), "inspecting")).toBe("enterDraftMode");
    expect(keyCommand(press("e", "KeyE"), "inspecting")).toBeNull();
  });

  // Laisse au navigateur les touches tenues avec Ctrl, Alt ou Cmd
  it("leaves keys held with Ctrl, Alt or Cmd to the browser", () => {
    expect(keyCommand(press("e", "KeyE", true), "draft")).toBeNull();
    expect(keyCommand(press("d", "KeyD", true), "view")).toBeNull();
  });

  // Ne fait rien des autres touches, dans aucun mode : Tab garde le focus, une lettre libre ne déclenche rien
  it("does nothing with any other key, in any mode", () => {
    expect(keyCommand(press("Tab", "Tab"), "view")).toBeNull();
    expect(keyCommand(press("x", "KeyX"), "view")).toBeNull();
    expect(keyCommand(press("x", "KeyX"), "draft")).toBeNull();
    expect(keyCommand(press("Tab", "Tab"), "inspecting")).toBeNull();
  });

  // En Dessin, Retour arrière ou Suppr retire la case visée du brouillon ; en Vue, rien
  it("in draft mode, Backspace or Delete takes the target out of the draft, and does nothing in view mode", () => {
    expect(keyCommand(press("Backspace", "Backspace"), "draft")).toBe("discardTarget");
    expect(keyCommand(press("Delete", "Delete"), "draft")).toBe("discardTarget");
    expect(keyCommand(press("Backspace", "Backspace"), "view")).toBeNull();
    expect(keyCommand(press("Delete", "Delete"), "inspecting")).toBeNull();
  });

  // Pipette armée, Espace prend la couleur de la case visée ; les autres touches du Dessin restent
  it("with the picker armed, Space picks the target's color and the other draft keys stay", () => {
    expect(keyCommand(press(" ", "Space"), "picking")).toBe("pickTarget");
    expect(keyCommand(press("i", "KeyI"), "picking")).toBe("togglePicker");
    expect(keyCommand(press("Enter", "Enter"), "picking")).toBe("submit");
    expect(keyCommand(press("Backspace", "Backspace"), "picking")).toBe("discardTarget");
  });
});

describe("targetStep (CDC 2026, la case visée au clavier)", () => {
  // Les flèches bougent la case visée d'une case
  it("moves the target one cell with the arrow keys", () => {
    expect(targetStep(press("ArrowUp", "ArrowUp"))).toEqual({ dx: 0, dy: -1 });
    expect(targetStep(press("ArrowDown", "ArrowDown"))).toEqual({ dx: 0, dy: 1 });
    expect(targetStep(press("ArrowLeft", "ArrowLeft"))).toEqual({ dx: -1, dy: 0 });
    expect(targetStep(press("ArrowRight", "ArrowRight"))).toEqual({ dx: 1, dy: 0 });
  });

  // Maj + flèche : dix cases d'un coup
  it("moves ten cells at once with Shift", () => {
    expect(targetStep(press("ArrowRight", "ArrowRight", false, true))).toEqual({ dx: 10, dy: 0 });
    expect(targetStep(press("ArrowUp", "ArrowUp", false, true))).toEqual({ dx: 0, dy: -10 });
  });

  // Ctrl, Alt ou Cmd + flèche restent au navigateur, et les autres touches ne bougent rien
  it("leaves arrows held with Ctrl, Alt or Cmd to the browser, and ignores every other key", () => {
    expect(targetStep(press("ArrowLeft", "ArrowLeft", true))).toBeNull();
    expect(targetStep(press("d", "KeyD"))).toBeNull();
    expect(targetStep(press(" ", "Space"))).toBeNull();
  });
});
