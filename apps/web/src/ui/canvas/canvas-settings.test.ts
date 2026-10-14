import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BubbleTargetsContext, createBubbleTargets } from "../help/bubble-target";
import { type ThemeField, ThemeSettings } from "./canvas-settings";

const noop = () => undefined;

const field = (status: ThemeField["status"]): ThemeField => ({
  status,
  value: "",
  isSaving: false,
  onInput: noop,
  onCommit: noop,
});

const render = (status: ThemeField["status"]): string =>
  renderToStaticMarkup(createElement(ThemeSettings, { theme: field(status) }));

describe("le champ Thème des réglages de la fresque", () => {
  // Tant que le thème se lit, un squelette de champ prend la place du champ, sous son libellé et sa légende
  it("shows a field skeleton under its label while the theme is read", () => {
    const html = render("loading");

    expect(html).toContain("Thème");
    expect(html).toContain("lp-skeleton-block--field");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<input");
  });

  // Quand le thème est là, le champ s'ouvre
  it("opens the field once the theme is read", () => {
    const html = render("ready");

    expect(html).toContain("<input");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("lp-skeleton");
  });

  // Si le thème ne se lit pas, le champ reste fermé et le dit, sans squelette
  it("keeps the field closed and says so when the theme cannot be read", () => {
    const html = render("unavailable");

    expect(html).toContain("<input");
    expect(html).toContain("disabled");
    expect(html).not.toContain("lp-skeleton");
  });
});

// Écart §8.1 (JOURNAL 2026-10-12) : le champ du thème est la cible de la bulle qui invite le streamer à en donner un
describe("le champ Thème, cible d'une bulle d'aide (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const inGame = (status: ThemeField["status"]): string =>
    renderToStaticMarkup(
      createElement(
        BubbleTargetsContext,
        { value: createBubbleTargets() },
        createElement(ThemeSettings, { theme: field(status) }),
      ),
    );

  // Dans la page de jeu : un `<span>` entoure le champ, et lui seul ; le libellé et la légende restent dehors
  it("wraps the input, and only it, in a span the bubble can aim at, in the game page", () => {
    const html = inGame("ready");

    expect([...html.matchAll(/<span class="lp-bubble-target">/g)]).toHaveLength(1);
    expect(html).toMatch(/<span class="lp-bubble-target"><input[^>]*class="lp-input[^"]*"/);
    expect(html.indexOf("Thème")).toBeLessThan(html.indexOf("lp-bubble-target"));
  });

  // Pas de champ à viser tant que le thème se lit : le squelette n'est pas une cible
  it("has nothing to aim at while the theme is read", () => {
    const html = inGame("loading");

    expect(html).toContain("lp-skeleton-block--field");
    expect(html).not.toContain("lp-bubble-target");
  });

  // Hors de la page de jeu (/design), le champ reste seul
  it("leaves the field alone outside the game page", () => {
    expect(render("ready")).not.toContain("lp-bubble-target");
  });
});
