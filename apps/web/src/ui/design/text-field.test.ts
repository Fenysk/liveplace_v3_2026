import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextField } from "./text-field";

const noop = () => undefined;

const render = (isLoading: boolean): string =>
  renderToStaticMarkup(createElement(TextField, { label: "Thème", value: "", onInput: noop, isLoading }));

describe("le champ de texte qui charge", () => {
  // Tant que sa valeur arrive, le champ garde son libellé et montre à sa place un bloc de la forme d'un champ
  it("keeps its label and shows a field-shaped skeleton in place of its input while the value loads", () => {
    const html = render(true);

    expect(html).toContain("Thème");
    expect(html).toContain("lp-skeleton-block--field");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<input");
  });

  // Une fois la valeur là, le champ est un champ, sans trace d'attente
  it("is a plain input once the value is there", () => {
    const html = render(false);

    expect(html).toContain("<input");
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("lp-skeleton");
  });
});
