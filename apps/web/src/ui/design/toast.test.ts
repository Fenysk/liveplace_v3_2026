import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toast, toastDurationMs } from "./toast";

// Le toast et son bouton d'action (Écart §9.3, JOURNAL 2026-10-13).

const noop = (): void => undefined;
const render = (action?: { label: string; onPress: () => void }): string =>
  renderToStaticMarkup(
    createElement(Toast, {
      message: { id: 1, tone: "success", text: "Brouillon vidé", ...(action ? { action } : {}) },
      isDocked: false,
    }),
  );

describe("le toast qui porte une action", () => {
  // L'action est un vrai bouton, après la phrase
  it("shows the action as a button after the sentence", () => {
    const markup = render({ label: "Rétablir", onPress: noop });

    expect(markup).toMatch(/Brouillon vidé.*<button[^>]*>.*Rétablir/s);
  });

  // Sans action, rien de plus qu'avant : pas de bouton
  it("has no button without an action", () => {
    expect(render()).not.toContain("<button");
  });

  // Il reste plus longtemps quand il porte une action : le temps d'appuyer
  it("stays longer when it carries an action", () => {
    expect(toastDurationMs(false)).toBe(3000);
    expect(toastDurationMs(true)).toBe(5000);
  });
});

describe("le toast au-dessus d'une fenêtre (Écart §8.1, JOURNAL 2026-10-13)", () => {
  const css = readFileSync(join(import.meta.dirname, "toast.css"), "utf8").replace(/\s+/g, " ");
  const message = { id: 1, tone: "success", text: "Thème enregistré" } as const;
  const docked = renderToStaticMarkup(createElement(Toast, { message }));
  const posed = renderToStaticMarkup(createElement(Toast, { message, isDocked: false }));

  // Une fenêtre modale couvre tout hors de la couche supérieure : le toast docké y monte, en `popover` natif comme les bulles
  it("rises into the top layer as a manual popover once docked, so no window can cover it", () => {
    expect(docked).toContain('popover="manual"');
    expect(docked).toContain("lp-toast-layer");
    expect(docked).toContain('data-dock="toast"');
  });

  // Sur /design il est posé sur place, dans sa démonstration : jamais sorti de son cadre
  it("stays where it is posed on /design", () => {
    expect(posed).not.toContain("popover");
    expect(posed).not.toContain("lp-toast-layer");
  });

  // Les styles de base d'un popover (cadre, fond, marge, remplissage, défilement) ne touchent pas le toast : sa boîte est nulle
  it("drops the base styles of a popover, and keeps a box of no size", () => {
    expect(css).toMatch(
      /\.lp-toast-layer \{[^}]*margin: 0;[^}]*padding: 0;[^}]*border: 0;[^}]*overflow: visible;[^}]*background: transparent/,
    );
    expect(css).toMatch(/\.lp-toast-layer \{[^}]*width: 0;[^}]*height: 0/);
  });
});
