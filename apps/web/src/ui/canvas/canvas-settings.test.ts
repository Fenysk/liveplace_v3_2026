import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
