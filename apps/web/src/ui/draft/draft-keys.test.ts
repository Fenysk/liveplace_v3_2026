import { describe, expect, it } from "vitest";
import { type KeyPress, keyCommand } from "./draft-keys";

const press = (key: string, code: string, hasModifier = false): KeyPress => ({ key, code, hasModifier });

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
});
