import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "./reveal";

// Un contrôle qui paraît en fondu, à sa place : rien ne bouge autour de lui (Écart §9.3, JOURNAL 2026-10-13).

const css = readFileSync(join(import.meta.dirname, "reveal.css"), "utf8").replace(/\s+/g, " ");
// `Reveal` n'a pas d'état : l'appeler rend directement ce qu'il rend.
const reveal = (isOpen: boolean): string =>
  renderToStaticMarkup(Reveal({ isOpen, children: createElement("button", { type: "button" }, "Vider") }));

describe("le contrôle qui paraît", () => {
  // Fermé, il reste dans la page mais ni le clavier ni les lecteurs d'écran ne le voient
  it("stays in the page while closed, but inert", () => {
    expect(reveal(false)).toContain("<button");
    expect(reveal(false)).toContain("inert");
    expect(reveal(false)).not.toContain("is-open");
  });

  // Ouvert, il répond au clavier et aux lecteurs d'écran
  it("answers the keyboard and screen readers once open", () => {
    expect(reveal(true)).toContain("is-open");
    expect(reveal(true)).not.toContain("inert");
  });

  // Fermé il garde sa place : ni largeur nulle, ni marge négative, et seule l'opacité change
  it("keeps its width while closed, so the controls around it never move", () => {
    expect(css).toMatch(/\.lp-reveal \{[^}]*flex: none/);
    expect(css).toMatch(/\.lp-reveal \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.lp-reveal\.is-open \{[^}]*opacity: 1/);
    expect(css).not.toMatch(/margin-inline-start|flex-basis|0px/);
    expect(css).not.toMatch(/transition:[^;]*(flex|margin|width)/);
  });
});
