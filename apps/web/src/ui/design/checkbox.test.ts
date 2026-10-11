import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

// La case à cocher (JOURNAL 2026-09-28) : sa coche paraît en fondu et à l'échelle, et disparaît de même.

const css = readFileSync(join(import.meta.dirname, "checkbox.css"), "utf8").replace(/\s+/g, " ");
const render = (isChecked: boolean): string =>
  renderToStaticMarkup(
    createElement(Checkbox, { label: "Retirer tous ses pixels", isChecked, onToggle: () => undefined }),
  );

describe("la case à cocher, sa coche", () => {
  // La case reste un vrai `<input type="checkbox">` : clavier, lecteur d'écran et libellé qui la coche ne changent pas
  it("keeps the native input, with the tick drawn right after it", () => {
    expect(render(true)).toMatch(/<input type="checkbox"[^>]*checked=""[^>]*\/><svg[^>]*lp-checkbox-tick/);
    expect(render(false)).not.toContain("checked");
  });

  // La coche est toujours dans la page, c'est sa transition qui la montre : sans cela elle paraîtrait d'un coup
  it("holds the tick in the page whether checked or not", () => {
    for (const isChecked of [true, false]) expect(render(isChecked)).toContain("lp-checkbox-tick");
  });

  // Le fondu et la mise à l'échelle durent `--lp-dur-fast` et suivent `--lp-ease` : `prefers-reduced-motion` les met à 0
  it("fades and scales it through the motion tokens, which reduced motion sets to zero", () => {
    expect(css).toMatch(
      /\.lp-checkbox-tick \{[^}]*transition: opacity var\(--lp-dur-fast\) var\(--lp-ease\), transform var\(--lp-dur-fast\) var\(--lp-ease\)/,
    );
    expect(css).not.toMatch(/\d(ms|s)\b/);
  });

  // Cochée, la coche est pleine et à sa taille ; décochée, transparente et rapetissée
  it("shows the tick when checked and hides it when not", () => {
    expect(css).toMatch(/\.lp-checkbox-tick \{[^}]*opacity: 0;[^}]*transform: scale\(0\.5\)/);
    expect(css).toMatch(/input:checked \+ \.lp-checkbox-tick \{[^}]*opacity: 1;[^}]*transform: none/);
  });
});
