import { describe, expect, it } from "vitest";
import { type KeyPress, keyCommand } from "./draft-keys";

const press = (key: string, code: string, hasModifier = false): KeyPress => ({ key, code, hasModifier });

describe("keyCommand (CDC 2026, raccourcis)", () => {
  // Entre en Dessin par D ou Entrée, en minuscule comme en majuscule
  it("enters draft mode with D or Enter, lowercase or uppercase", () => {
    expect(keyCommand(press("d", "KeyD"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press("D", "KeyD"), "view")).toBe("enterDraftMode");
    expect(keyCommand(press("Enter", "Enter"), "view")).toBe("enterDraftMode");
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

  // Ne fait rien des touches du Dessin en Vue, ni de D en Dessin
  it("does nothing with draft keys in view mode, nor with D in draft mode", () => {
    expect(keyCommand(press("e", "KeyE"), "view")).toBeNull();
    expect(keyCommand(press(" ", "Space"), "view")).toBeNull();
    expect(keyCommand(press("Escape", "Escape"), "view")).toBeNull();
    expect(keyCommand(press("d", "KeyD"), "draft")).toBeNull();
  });

  // Laisse au navigateur les touches tenues avec Ctrl, Alt ou Cmd
  it("leaves keys held with Ctrl, Alt or Cmd to the browser", () => {
    expect(keyCommand(press("e", "KeyE", true), "draft")).toBeNull();
    expect(keyCommand(press("d", "KeyD", true), "view")).toBeNull();
  });
});
