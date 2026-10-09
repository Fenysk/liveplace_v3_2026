import { describe, expect, it } from "vitest";
import {
  isTypingElement,
  type KeyMode,
  type KeyPress,
  keyAction,
  keyCommand,
  recentColorSlot,
  targetStep,
  toKeyPress,
} from "./draft-keys";

const press = (key: string, code: string, hasModifier = false, isShifted = false): KeyPress => ({
  key,
  code,
  hasModifier,
  isCtrlOrCmd: hasModifier,
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

describe("recentColorSlot (JOURNAL 2026-10-09, dessiner sans quitter le canvas)", () => {
  // Les touches 1 à 5 de la rangée du haut prennent les cinq récentes, dans l'ordre où elles s'affichent
  it("maps the top-row keys 1 to 5 to the five recent colors, in the order they are shown", () => {
    expect([1, 2, 3, 4, 5].map((n) => recentColorSlot(press(String(n), `Digit${n}`)))).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  // Le pavé numérique aussi
  it("maps the numpad keys 1 to 5 the same way", () => {
    expect([1, 2, 3, 4, 5].map((n) => recentColorSlot(press(String(n), `Numpad${n}`)))).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  // Lit la touche physique, pas le caractère : sur AZERTY la rangée donne & é " ' ( sans Maj, et ! @ # $ % sur QWERTY avec Maj
  it("reads the physical key, so an AZERTY keyboard works without Shift", () => {
    expect(recentColorSlot(press("&", "Digit1"))).toBe(0);
    expect(recentColorSlot(press("é", "Digit2"))).toBe(1);
    expect(recentColorSlot(press('"', "Digit3"))).toBe(2);
    expect(recentColorSlot(press("(", "Digit5"))).toBe(4);
    expect(recentColorSlot(press("!", "Digit1", false, true))).toBe(0);
  });

  // Ne prend ni 0, ni 6 à 9, ni une lettre dont le caractère serait un chiffre
  it("takes neither 0, nor 6 to 9, nor a key that merely types a digit", () => {
    for (const code of ["Digit0", "Digit6", "Digit7", "Digit8", "Digit9", "Numpad0", "Numpad6", "Numpad9"]) {
      expect(recentColorSlot(press("1", code))).toBeNull();
    }
    expect(recentColorSlot(press("1", "KeyA"))).toBeNull();
    expect(recentColorSlot(press("a", "KeyA"))).toBeNull();
  });

  // Verrouillage numérique éteint, la touche 1 du pavé donne Fin et la 3 Page suivante : elles ne prennent aucune couleur
  it("ignores a numpad key that does not type its digit, the numeric lock being off", () => {
    expect(recentColorSlot(press("End", "Numpad1"))).toBeNull();
    expect(recentColorSlot(press("PageDown", "Numpad3"))).toBeNull();
    expect(recentColorSlot(press("Clear", "Numpad5"))).toBeNull();
  });

  // Laisse au navigateur les touches tenues avec Ctrl, Alt ou Cmd (Ctrl+1 change d'onglet)
  it("leaves keys held with Ctrl, Alt or Cmd to the browser", () => {
    expect(recentColorSlot(press("1", "Digit1", true))).toBeNull();
    expect(recentColorSlot(press("3", "Numpad3", true))).toBeNull();
  });
});

describe("keyAction (JOURNAL 2026-10-09, la palette au clavier)", () => {
  const DRAWING: readonly KeyMode[] = ["draft", "picking"];

  // En Dessin, la touche 1 à 5 prend la récente de sa place, pipette armée ou non
  it("in draft mode, picks the recent color of the pressed digit, with the picker armed or not", () => {
    for (const mode of DRAWING) {
      expect(keyAction(press("&", "Digit1"), mode, false)).toEqual({ kind: "pickRecentColor", slot: 0 });
      expect(keyAction(press("5", "Numpad5"), mode, false)).toEqual({ kind: "pickRecentColor", slot: 4 });
    }
  });

  // En Vue, comme pendant une inspection, les chiffres ne font rien
  it("does nothing with the digits in view mode or while inspecting", () => {
    expect(keyAction(press("&", "Digit1"), "view", false)).toBeNull();
    expect(keyAction(press("2", "Digit2"), "inspecting", false)).toBeNull();
  });

  // Avec Ctrl, Alt ou Cmd, un chiffre ne prend aucune couleur
  it("does not pick a color when a digit is held with Ctrl, Alt or Cmd", () => {
    expect(keyAction(press("1", "Digit1", true), "draft", false)).toBeNull();
  });

  // Hors de la palette, les flèches bougent la case visée, Entrée valide et Échap sort du Dessin (CDC 2026)
  it("outside the palette, the arrows move the target, Enter submits and Escape leaves draft mode", () => {
    expect(keyAction(press("ArrowLeft", "ArrowLeft"), "draft", false)).toEqual({
      kind: "moveTarget",
      step: { dx: -1, dy: 0 },
    });
    expect(keyAction(press("Enter", "Enter"), "draft", false)).toEqual({
      kind: "command",
      command: "submit",
    });
    expect(keyAction(press("Escape", "Escape"), "draft", false)).toEqual({
      kind: "command",
      command: "exitDraftMode",
    });
    expect(keyAction(press(" ", "Space"), "draft", false)).toEqual({
      kind: "command",
      command: "startTrace",
    });
  });

  // Tant que le focus est dans la palette, les flèches ne bougent jamais la case visée
  it("while the focus is in the palette, the arrows never move the target", () => {
    for (const mode of DRAWING) {
      for (const arrow of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        expect(keyAction(press(arrow, arrow), mode, true)).toBeNull();
        expect(keyAction({ ...press(arrow, arrow), isShifted: true }, mode, true)).toBeNull();
      }
    }
  });

  // Dans la palette, Entrée ne valide pas, Échap ne sort pas du Dessin, Espace ne trace pas : elle garde ces touches
  it("in the palette, Enter does not submit, Escape does not leave draft mode and Space does not trace", () => {
    for (const mode of DRAWING) {
      expect(keyAction(press("Enter", "Enter"), mode, true)).toBeNull();
      expect(keyAction(press("Escape", "Escape"), mode, true)).toBeNull();
      expect(keyAction(press(" ", "Space"), mode, true)).toBeNull();
      expect(keyAction(press("Home", "Home"), mode, true)).toBeNull();
    }
  });

  // Dans la palette, le reste du clavier du Dessin continue : E, I, Retour arrière et les chiffres
  it("in the palette, the rest of the draft keys still work: E, I, Backspace and the digits", () => {
    expect(keyAction(press("e", "KeyE"), "draft", true)).toEqual({
      kind: "command",
      command: "toggleEraser",
    });
    expect(keyAction(press("i", "KeyI"), "draft", true)).toEqual({
      kind: "command",
      command: "togglePicker",
    });
    expect(keyAction(press("Backspace", "Backspace"), "draft", true)).toEqual({
      kind: "command",
      command: "discardTarget",
    });
    expect(keyAction(press("&", "Digit1"), "draft", true)).toEqual({ kind: "pickRecentColor", slot: 0 });
  });

  // Dans la palette, Ctrl + flèche reste au navigateur et ne bouge rien non plus
  it("in the palette, an arrow held with Ctrl does nothing", () => {
    expect(keyAction(press("ArrowRight", "ArrowRight", true), "draft", true)).toBeNull();
  });
});

describe("Annuler et Rétablir au clavier (CDC 2026, §8 Historique)", () => {
  const DRAWING: readonly KeyMode[] = ["draft", "picking"];
  const ctrl = (key: string, code: string, isShifted = false): KeyPress => press(key, code, true, isShifted);
  // Alt seul, ou AltGr (Ctrl + Alt) : une touche à lettres, jamais Ctrl ou Cmd
  const alt = (key: string, code: string): KeyPress => ({ ...press(key, code, true), isCtrlOrCmd: false });

  // Ctrl+Z annule, Ctrl+Maj+Z et Ctrl+Y rétablissent, pipette armée ou non
  it("undoes with Ctrl+Z, redoes with Ctrl+Shift+Z and Ctrl+Y, with the picker armed or not", () => {
    for (const mode of DRAWING) {
      expect(keyCommand(ctrl("z", "KeyZ"), mode)).toBe("undo");
      expect(keyCommand(ctrl("Z", "KeyZ", true), mode)).toBe("redo");
      expect(keyCommand(ctrl("y", "KeyY"), mode)).toBe("redo");
    }
  });

  // Lit la lettre en minuscule : Verr. Maj. allumé, Ctrl+Z reste Annuler et Ctrl+Maj+Z Rétablir
  it("reads the letter in lowercase: with Caps Lock on, Ctrl+Z still undoes and Ctrl+Shift+Z still redoes", () => {
    expect(keyCommand(ctrl("Z", "KeyZ"), "draft")).toBe("undo");
    expect(keyCommand(ctrl("z", "KeyZ", true), "draft")).toBe("redo");
    expect(keyCommand(ctrl("Y", "KeyY"), "draft")).toBe("redo");
  });

  // Sur un clavier AZERTY, le Z est à la place du W : Ctrl+Z annule, et la touche W de l'AZERTY, à la place du Z, non
  it("works on an AZERTY keyboard: Z is where the W of QWERTY is, and the W key, where the QWERTY Z is, does nothing", () => {
    expect(keyCommand(ctrl("z", "KeyW"), "draft")).toBe("undo");
    expect(keyCommand(ctrl("Z", "KeyW", true), "draft")).toBe("redo");
    expect(keyCommand(ctrl("y", "KeyY"), "draft")).toBe("redo");
    expect(keyCommand(ctrl("w", "KeyZ"), "draft")).toBeNull();
  });

  // Sur un QWERTZ, Z et Y sont échangés : la touche qui porte la lettre décide
  it("works on a QWERTZ keyboard, where Z and Y are swapped: the key that carries the letter decides", () => {
    expect(keyCommand(ctrl("z", "KeyY"), "draft")).toBe("undo");
    expect(keyCommand(ctrl("y", "KeyZ"), "draft")).toBe("redo");
  });

  // Une disposition qui n'a pas de lettre latine (cyrillique, grec) retombe sur la place de la touche
  it("falls back on the place of the key when the layout types no Latin letter", () => {
    expect(keyCommand(ctrl("я", "KeyZ"), "draft")).toBe("undo");
    expect(keyCommand(ctrl("Я", "KeyZ", true), "draft")).toBe("redo");
    expect(keyCommand(ctrl("н", "KeyY"), "draft")).toBe("redo");
    expect(keyCommand(ctrl("ζ", "KeyZ"), "draft")).toBe("undo");
    expect(keyCommand(ctrl("ч", "KeyX"), "draft")).toBeNull();
  });

  // Ctrl+Maj+Y n'est pas à nous (Firefox y ouvre les téléchargements), Alt et AltGr non plus, et Z seul ne fait rien
  it("leaves Ctrl+Shift+Y, Alt+Z, AltGr+Z and a plain Z alone", () => {
    expect(keyCommand(ctrl("Y", "KeyY", true), "draft")).toBeNull();
    expect(keyCommand(alt("z", "KeyZ"), "draft")).toBeNull();
    expect(keyCommand(alt("y", "KeyY"), "draft")).toBeNull();
    expect(keyCommand(press("z", "KeyZ"), "draft")).toBeNull();
    expect(keyCommand(press("Z", "KeyZ", false, true), "draft")).toBeNull();
    expect(keyCommand(ctrl("x", "KeyX"), "draft")).toBeNull();
  });

  // Rien en Vue, ni pendant une inspection : Ctrl+Z y reste au navigateur
  it("does nothing in view mode or while inspecting, leaving Ctrl+Z to the browser", () => {
    for (const mode of ["view", "inspecting"] as const) {
      expect(keyCommand(ctrl("z", "KeyZ"), mode)).toBeNull();
      expect(keyAction(ctrl("z", "KeyZ", true), mode, false)).toBeNull();
      expect(keyAction(ctrl("y", "KeyY"), mode, false)).toBeNull();
    }
  });

  // Dans la palette, Ctrl+Z reste à nous : elle ne garde que ses touches de déplacement
  it("still undoes while the focus is in the palette", () => {
    expect(keyAction(ctrl("z", "KeyZ"), "draft", true)).toEqual({ kind: "command", command: "undo" });
    expect(keyAction(ctrl("y", "KeyY"), "picking", true)).toEqual({ kind: "command", command: "redo" });
  });

  // Les autres touches du Dessin gardent leur sens, et un Ctrl + chiffre ou Ctrl + E restent au navigateur
  it("leaves the other draft keys as they were, and Ctrl+E or Ctrl+1 to the browser", () => {
    expect(keyAction(press("e", "KeyE"), "draft", false)).toEqual({
      kind: "command",
      command: "toggleEraser",
    });
    expect(keyAction(ctrl("e", "KeyE"), "draft", false)).toBeNull();
    expect(keyAction(ctrl("1", "Digit1"), "draft", false)).toBeNull();
  });
});

describe("toKeyPress (CDC 2026, §8 Historique : Ctrl sur PC, Cmd sur Mac)", () => {
  const event = (overrides: Partial<Parameters<typeof toKeyPress>[0]> = {}) => ({
    key: "z",
    code: "KeyZ",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  });

  // Ctrl et Cmd sont la même touche de raccourci
  it("takes Ctrl and Cmd for the same shortcut key", () => {
    expect(toKeyPress(event({ ctrlKey: true }))).toMatchObject({ hasModifier: true, isCtrlOrCmd: true });
    expect(toKeyPress(event({ metaKey: true }))).toMatchObject({ hasModifier: true, isCtrlOrCmd: true });
  });

  // Alt seul est un modificateur, mais pas Ctrl ou Cmd ; AltGr (Ctrl + Alt) non plus
  it("takes Alt, and AltGr which is Ctrl plus Alt, for modifiers that are not Ctrl or Cmd", () => {
    expect(toKeyPress(event({ altKey: true }))).toMatchObject({ hasModifier: true, isCtrlOrCmd: false });
    expect(toKeyPress(event({ ctrlKey: true, altKey: true }))).toMatchObject({
      hasModifier: true,
      isCtrlOrCmd: false,
    });
  });

  // Sans modificateur, rien ; Maj se lit à part, et la touche passe telle quelle
  it("has no modifier on a plain key, reads Shift apart, and passes the key through", () => {
    expect(toKeyPress(event({ shiftKey: true, key: "Z" }))).toEqual({
      key: "Z",
      code: "KeyZ",
      hasModifier: false,
      isCtrlOrCmd: false,
      isShifted: true,
    });
  });
});

describe("isTypingElement (CDC 2026, les raccourcis se taisent dans un champ de saisie)", () => {
  // Un champ, une zone de texte, une liste déroulante et un texte éditable gardent le clavier
  it("is true for an input, a textarea, a select and an editable text", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isTypingElement({ tagName, isContentEditable: false })).toBe(true);
    }
    expect(isTypingElement({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  // Un bouton, une pastille ou le corps de la page ne sont pas un champ
  it("is false for a button, a div or the body", () => {
    for (const tagName of ["BUTTON", "DIV", "BODY", "CANVAS"]) {
      expect(isTypingElement({ tagName, isContentEditable: false })).toBe(false);
    }
  });
});
