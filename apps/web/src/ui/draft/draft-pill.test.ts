import { PALETTE } from "@liveplace/domain";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { DraftPill, type DraftPillActions, type DraftPillState } from "./draft-pill";

// La pill Dessin ne bouge pas sous le pointeur (Écart §9.3, JOURNAL 2026-10-13) : ses boutons sont les mêmes brouillon vide ou non.

const noop = (): void => undefined;
const ACTIONS: DraftPillActions = {
  onEnter: noop,
  onClaim: noop,
  onExit: noop,
  onSubmit: noop,
  onDiscard: noop,
  onPickColor: noop,
  onToggleEraser: noop,
  onTogglePicker: noop,
  onToggleTouchTracing: noop,
  onReload: noop,
  onSignIn: noop,
};
const GAUGE = { charges: 8, max: 10, refill: null, label: "8 / 10 charges, jauge pleine" };

const drafting = (draftSize: number, waitSeconds?: number): DraftPillState => ({
  kind: "draft",
  gauge: GAUGE,
  palette: PALETTE,
  colorIndex: 5,
  recentColorIndexes: [1, 28, 19, 9, 42],
  isSending: false,
  draftSize,
  canSubmit: draftSize > 0,
  canDiscard: draftSize > 0,
  isTouchScreen: false,
  isTouchTracing: false,
  isPicking: false,
  ...(waitSeconds === undefined ? {} : { waitSeconds }),
});

const render = (state: DraftPillState, isCompact: boolean, locale: "fr" | "en" = "fr"): string =>
  renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { initial: locale },
      createElement(DraftPill, { state, actions: ACTIONS, isCompact, isDocked: false }) as ReactElement,
    ),
  );

// Les boutons de la rangée de la pill, dans l'ordre : leur titre, sinon leur texte.
const buttonsOf = (markup: string): string[] =>
  [...markup.matchAll(/<button[^>]*class="lp-btn[^"]*"[^>]*>(.*?)<\/button>/g)].map(([whole, inner]) => {
    const title = /title="([^"]*)"/.exec(whole ?? "")?.[1];
    return title ?? (inner ?? "").replaceAll(/<[^>]+>/g, "");
  });

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
});
