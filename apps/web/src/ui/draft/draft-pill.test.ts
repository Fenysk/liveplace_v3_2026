import { PALETTE } from "@liveplace/domain";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../design/button";
import { LocaleProvider } from "../locale/use-locale";
import { DraftPill, type DraftPillActions, type DraftPillState } from "./draft-pill";
import { DRAFT_TEXTS } from "./draft-texts";

// Le bouton rend comme avant, et se souvient des propriétés de chaque rendu : de quoi en presser un sans navigateur.
vi.mock("../design/button", { spy: true });

// La pill Dessin ne bouge pas sous le pointeur (Écart §9.3, JOURNAL 2026-10-13) : ses boutons sont les mêmes brouillon vide ou non.

const noop = (): void => undefined;
const ACTIONS: DraftPillActions = {
  onEnter: noop,
  onClaim: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onUndo: noop,
  onRedo: noop,
  onPickColor: noop,
  onToggleEraser: noop,
  onTogglePicker: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
  onSignIn: noop,
};
const GAUGE = { charges: 8, max: 10, refill: null, label: "8 / 10 charges, jauge pleine" };

const drafting = (draftSize: number, waitSeconds?: number): Extract<DraftPillState, { kind: "draft" }> => ({
  kind: "draft",
  gauge: GAUGE,
  palette: PALETTE,
  colorIndex: 5,
  recentColorIndexes: [1, 28, 19, 9, 42],
  isSending: false,
  draftSize,
  canSubmit: draftSize > 0,
  canDiscard: draftSize > 0,
  canUndo: draftSize > 0,
  canRedo: false,
  isTouchScreen: false,
  isTouchTracing: false,
  isPicking: false,
  ...(waitSeconds === undefined ? {} : { waitSeconds }),
});

const render = (
  state: DraftPillState,
  isCompact: boolean,
  locale: "fr" | "en" = "fr",
  actions: DraftPillActions = ACTIONS,
): string => {
  vi.mocked(Button).mockClear();
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { initial: locale },
      createElement(DraftPill, { state, actions, isCompact, isDocked: false }) as ReactElement,
    ),
  );
};

// Les boutons de la rangée de la pill, dans l'ordre : leur titre, sinon leur texte.
const buttonsOf = (markup: string): string[] =>
  [...markup.matchAll(/<button[^>]*class="lp-btn[^"]*"[^>]*>(.*?)<\/button>/g)].map(([whole, inner]) => {
    const title = /title="([^"]*)"/.exec(whole ?? "")?.[1];
    return title ?? (inner ?? "").replaceAll(/<[^>]+>/g, "");
  });

// Le titre tel que le balisage l'écrit : l'apostrophe y est échappée.
const asMarkup = (text: string): string => text.replaceAll("'", "&#x27;");

const UNDO = asMarkup(DRAFT_TEXTS.fr.undoTip);
const REDO = asMarkup(DRAFT_TEXTS.fr.redoTip);

// Le bouton nommé par ce titre est-il grisé ?
const isGreyed = (markup: string, title: string): boolean =>
  (markup.match(/<button[^>]*>/g) ?? []).some(
    (tag) => tag.includes(`title="${title}"`) && tag.includes("disabled"),
  );

describe.each([
  ["on a computer", false],
  ["on a phone", true],
])("the Draw pill %s", (_name, isCompact) => {
  // La corbeille est là dès le brouillon vide : mêmes boutons, même ordre, avec ou sans pixel
  it("has the same buttons in the same order, with an empty draft or not", () => {
    expect(buttonsOf(render(drafting(0), isCompact))).toEqual(buttonsOf(render(drafting(3), isCompact)));
    expect(buttonsOf(render(drafting(0), isCompact))).toContain("Vider le brouillon");
  });

  // Vide, la corbeille est invisible pour le clavier et les lecteurs d'écran ; au premier pixel elle paraît
  it("hides the trash from keyboard and screen readers until the first pixel", () => {
    expect(render(drafting(0), isCompact)).toMatch(/<div class="lp-reveal" inert="">/);
    expect(render(drafting(1), isCompact)).toMatch(/<div class="lp-reveal is-open">/);
  });

  // Valider garde la largeur de « Valider · 99 », dans chaque langue, tant qu'il ne décompte pas une attente
  it("keeps Confirm as wide as its longest count, in each language, except while it counts a wait", () => {
    expect(render(drafting(0), isCompact)).toContain('data-reserve="Valider · 99"');
    expect(render(drafting(3), isCompact, "en")).toContain('data-reserve="Confirm · 99"');
    expect(render(drafting(0, 12), isCompact)).not.toContain("data-reserve");
  });

  // Annuler puis Rétablir, côte à côte juste avant Vider, et après la pipette (CDC 2026, §8)
  it("puts Annuler then Rétablir side by side, after the picker and just before Vider", () => {
    const buttons = buttonsOf(render(drafting(3), isCompact));
    const undoAt = buttons.indexOf(UNDO);

    expect(buttons.indexOf(asMarkup(DRAFT_TEXTS.fr.eyedropperTip))).toBeLessThan(undoAt);
    expect(buttons.slice(undoAt, undoAt + 3)).toEqual([UNDO, REDO, "Vider le brouillon"]);
  });

  // Grisés sans étape à faire, jamais retirés : seul ce qui peut se faire est actif
  it("greys Annuler and Rétablir when there is nothing to undo or redo, and never removes them", () => {
    const withHistory = (canUndo: boolean, canRedo: boolean) => ({ ...drafting(3), canUndo, canRedo });
    const nothing = render(withHistory(false, false), isCompact);
    const undoable = render(withHistory(true, false), isCompact);
    const redoable = render(withHistory(false, true), isCompact);

    expect([isGreyed(nothing, UNDO), isGreyed(nothing, REDO)]).toEqual([true, true]);
    expect([isGreyed(undoable, UNDO), isGreyed(undoable, REDO)]).toEqual([false, true]);
    expect([isGreyed(redoable, UNDO), isGreyed(redoable, REDO)]).toEqual([true, false]);
    expect(buttonsOf(nothing)).toEqual(buttonsOf(redoable));
  });

  // Un appui sur Annuler appelle l'annulation, un appui sur Rétablir le rétablissement, et aucun autre bouton
  it("calls the undo of the actions from Annuler and the redo from Rétablir", () => {
    const calls: string[] = [];
    const actions: DraftPillActions = {
      ...ACTIONS,
      onUndo: () => calls.push("undo"),
      onRedo: () => calls.push("redo"),
    };
    render({ ...drafting(3), canUndo: true, canRedo: true }, isCompact, "fr", actions);
    const press = (title: string) => {
      const call = vi.mocked(Button).mock.calls.find(([props]) => props.title === title);
      call?.[0].onPress?.();
    };

    press(DRAFT_TEXTS.fr.undoTip);
    press(DRAFT_TEXTS.fr.redoTip);
    press(DRAFT_TEXTS.fr.undoTip);

    expect(calls).toEqual(["undo", "redo", "undo"]);
  });
});
