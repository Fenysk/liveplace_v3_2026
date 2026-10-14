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

describe("le champ de texte dont une bulle vise le champ (Écart §8.1, JOURNAL 2026-10-12)", () => {
  const wrapped = (isLoading: boolean): string =>
    renderToStaticMarkup(
      createElement(TextField, {
        label: "Thème",
        value: "",
        onInput: noop,
        isLoading,
        wrapInput: (input) => createElement("span", { className: "target" }, input),
      }),
    );

  // Le champ seul est enveloppé : le libellé reste au-dessus, hors de la cible
  it("wraps the input alone, the label staying out of the wrapper", () => {
    const html = wrapped(false);

    expect(html).toMatch(/<span class="target"><input[^>]*\/><\/span>/);
    expect(html.indexOf("Thème")).toBeLessThan(html.indexOf('<span class="target">'));
    expect(html.match(/class="target"/g)).toHaveLength(1);
  });

  // Tant que la valeur arrive, il n'y a pas de champ à viser : le squelette n'est pas enveloppé
  it("has nothing to wrap while the value loads", () => {
    expect(wrapped(true)).not.toContain('class="target"');
  });

  // Sans enveloppe, le champ est celui d'avant
  it("is the same input without a wrapper", () => {
    expect(render(false)).toMatch(/<div class="lp-field"><label[^>]*>Thème<\/label><input/);
  });
});
