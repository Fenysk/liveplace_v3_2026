import { describe, expect, it, vi } from "vitest";
import { createDraftPan } from "./draft-pan";

describe("le glissement en Dessin (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Un doigt qui glisse en Dessin, Tracé éteint, déplace la vue au lieu de dessiner : c'est retenu
  it("remembers a finger that moved the view in Draft with Trace off", () => {
    const pan = createDraftPan();
    expect(pan.hasPanned()).toBe(false);

    pan.record({ mode: "draft", isTouchTracing: false });
    expect(pan.hasPanned()).toBe(true);
  });

  // En Vue, ou Tracé armé (un doigt trace alors), le glissement ne dit rien du Tracé
  it("ignores a move in View, and one while Trace is on", () => {
    const pan = createDraftPan();
    pan.record({ mode: "view", isTouchTracing: false });
    pan.record({ mode: "draft", isTouchTracing: true });

    expect(pan.hasPanned()).toBe(false);
  });

  // Quitter le Dessin l'efface : la prochaine occasion repart de zéro
  it("is forgotten when cleared", () => {
    const pan = createDraftPan();
    pan.record({ mode: "draft", isTouchTracing: false });
    pan.clear();

    expect(pan.hasPanned()).toBe(false);
  });

  // Prévient qui écoute quand l'état change seulement, et cesse quand il se retire
  it("tells who listens only when the state changes, and stops when he stops listening", () => {
    const pan = createDraftPan();
    const listener = vi.fn();
    const stop = pan.subscribe(listener);

    pan.record({ mode: "draft", isTouchTracing: false });
    pan.record({ mode: "draft", isTouchTracing: false });
    expect(listener).toHaveBeenCalledTimes(1);

    pan.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    pan.record({ mode: "draft", isTouchTracing: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
