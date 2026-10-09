import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pointer } from "lucide-react";
import { createElement, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble, BubbleLine } from "./bubble";

// Écart §8.1 (JOURNAL 2026-10-08) : la bulle, une surface de pill qui guide un geste.

// Le contenu : les composants le demandent dans leurs props, que `createElement` n'accepte qu'ainsi.
const text = { children: "Touche un pixel" };
const line = { children: createElement(BubbleLine, { icon: Pointer, ...text }) };
const target: RefObject<HTMLElement | null> = { current: null };

const render = (props: {
  isVisible: boolean;
  isDocked?: boolean;
  hasTarget?: boolean;
  isOverWindow?: boolean;
  side?: "above" | "below" | "left" | "right";
}): string =>
  renderToStaticMarkup(
    createElement(Bubble, {
      isVisible: props.isVisible,
      ...(props.isDocked === undefined ? {} : { isDocked: props.isDocked }),
      ...(props.isOverWindow === undefined ? {} : { isOverWindow: props.isOverWindow }),
      ...(props.side === undefined ? {} : { side: props.side }),
      ...(props.hasTarget ? { target } : {}),
      ...line,
    }),
  );

const bubbleCss = readFileSync(join(import.meta.dirname, "bubble.css"), "utf8");
const bubbleSource = readFileSync(join(import.meta.dirname, "bubble.tsx"), "utf8");

describe("la bulle (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Jamais montrée, elle n'est pas même dans la page : un lecteur d'écran n'a rien à sauter
  it("is not in the page until it is first shown", () => {
    expect(render({ isVisible: false })).toBe("");
  });

  // Montrée, elle porte son contenu libre : une icône muette et le texte, dans une surface de pill
  it("carries its free content, a silent icon and the text, on a pill surface", () => {
    const markup = render({ isVisible: true });

    expect(markup).toContain("lp-pill");
    expect(markup).toContain('<p class="lp-bubble-line lp-type-caption">');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("<span>Touche un pixel</span>");
  });

  // Posée sur l'écran, elle flotte ; sans dock (/design), elle reste sur place
  it("floats over the screen, and stays in place without a dock", () => {
    expect(render({ isVisible: true })).toContain("lp-floating");
    expect(render({ isVisible: true, isDocked: false })).not.toContain("lp-floating");
  });

  // Sans cible, pas de flèche ; avec une cible, la flèche et la place qu'elle prend
  it("has an arrow only when it aims at a target", () => {
    const free = render({ isVisible: true });
    const aiming = render({ isVisible: true, hasTarget: true });

    expect(free).not.toContain("lp-bubble-arrow");
    expect(free).not.toContain("lp-bubble--pointing");
    expect(aiming).toContain("lp-bubble-arrow");
    expect(aiming).toContain("lp-bubble--pointing");
  });

  // Aucun `style` rendu par le serveur : la CSP de prod le refuse, la position se pose côté client
  it("renders no style attribute: the position is set by the client", () => {
    expect(render({ isVisible: true, hasTarget: true })).not.toMatch(/\sstyle=/);
  });

  // Sans cible, elle se pose au-dessus de la barre du bas par les variables de placement existantes, sur mobile comme sur PC
  it("sits above the bottom bar through the existing placement variables, on mobile as on a PC", () => {
    const rules = bubbleCss.match(/:not\(\.lp-bubble--pointing\)\s*{[^}]*}/g) ?? [];

    expect(rules).toHaveLength(2);
    for (const rule of rules) expect(rule).toContain("var(--lp-bottom-bar");
    expect(rules[1]).toContain("env(safe-area-inset-bottom)");
  });

  // Le doigt la traverse : un pincement qui commence dessous zoome quand même
  it("lets the finger through", () => {
    expect(bubbleCss).toMatch(/\.lp-bubble > \.lp-pill\s*{[^}]*pointer-events: none/);
  });

  // Apparition et disparition en fondu, et `prefers-reduced-motion` : les durées viennent des tokens, que le mouvement réduit met à 0
  it("fades through the motion tokens, which reduced motion sets to zero", () => {
    expect(bubbleCss).toContain("animation: lp-bubble-in var(--lp-dur) var(--lp-ease)");
    expect(bubbleCss).not.toMatch(/\d(ms|s)\b/);
  });

  // Posée sur place, elle dit de quel côté de sa cible elle est, que le CSS lit pour tourner sa flèche
  it("says its side when posed in place, for the CSS to turn its arrow", () => {
    expect(render({ isVisible: true, isDocked: false, hasTarget: true })).toContain('data-side="above"');
    expect(render({ isVisible: true, isDocked: false, hasTarget: true, side: "below" })).toContain(
      'data-side="below"',
    );
  });

  // Posée sur l'écran, son côté est choisi côté client, avec la place : le serveur ne le rend pas
  it("leaves its side to the client when posed on the screen", () => {
    expect(render({ isVisible: true, hasTarget: true })).not.toContain("data-side");
  });

  // Posée sur l'écran, elle dit le dock de la pill qu'elle vise, que le CSS lit pour l'effacer avec les pills du haut
  it("says the dock of the pill it aims at, for the CSS to fade it with the top pills", () => {
    expect(bubbleSource).toContain('const AIMED_DOCK_ATTRIBUTE = "data-aimed-dock";');
    expect(bubbleSource).toContain("element.setAttribute(AIMED_DOCK_ATTRIBUTE, dock)");
    expect(render({ isVisible: true, hasTarget: true })).not.toContain("data-aimed-dock");
  });

  // La flèche se tourne avec le côté : vers le haut dessous, vers la droite à gauche de la cible, vers la gauche à sa droite
  it("turns its arrow with the side, and keeps the room for it on that side", () => {
    for (const side of ["below", "left", "right"]) {
      expect(bubbleCss).toContain(`.lp-bubble[data-side="${side}"] .lp-bubble-arrow {`);
      expect(bubbleCss).toContain(`.lp-bubble--pointing[data-side="${side}"] {`);
    }
  });

  // Écart §9.3 (JOURNAL 2026-10-09) : le bouton visé remplit son `<span>`, qui s'étire où le bouton seul s'étirerait
  // (la colonne latérale) : le +1 prend la place de Dessiner, comme lui, sans que le `<span>` y change rien
  it("lets the button it wraps fill the span, so the +1 stretches wherever Dessiner does", () => {
    expect(bubbleCss).toMatch(/\.lp-bubble-target > \.lp-btn \{[^}]*flex: 1 1 auto;/);
  });

  // Dans une fenêtre ouverte (JOURNAL 2026-10-09), seule la couche supérieure du navigateur passe devant la fenêtre modale :
  // la bulle le demande, et seulement elle
  it("asks for the top layer of the browser only when it lives in a window", () => {
    const inWindow = render({ isVisible: true, hasTarget: true, isOverWindow: true });

    expect(inWindow).toContain('popover="manual"');
    expect(render({ isVisible: true, hasTarget: true })).not.toContain("popover");
    expect(inWindow).not.toMatch(/\sstyle=/);
  });

  // Elle monte une fois la fenêtre ouverte (donc au-dessus d'elle), redescend après son fondu, et suit le défilement
  it("rises over the window when shown, comes down after its fade, and follows the scrolling", () => {
    expect(bubbleSource).toContain("element.showPopover()");
    expect(bubbleSource).toContain("element.hidePopover()");
    expect(bubbleSource).toContain('motionMs(element, "--lp-dur-fade")');
    expect(bubbleSource).toContain(
      'document.addEventListener("scroll", scroll, { capture: true, passive: true })',
    );
    expect(bubbleSource).toContain("isInsideClips(rectOf(aimed), clipsOf(aimed))");
  });

  // Les styles du navigateur d'un tel élément (cadre, fond, marge, défilement) tombent sans écraser les rembourrages de la flèche ;
  // sa cible a défilé hors du cadre : elle s'efface avec elle
  it("drops the browser's own styles in the top layer, and fades when its target is scrolled out", () => {
    expect(bubbleCss).toMatch(
      /:where\(\.lp-bubble\[popover\]\)\s*{[^}]*inset: auto;[^}]*margin: 0;[^}]*padding: 0;/,
    );
    expect(bubbleCss).toMatch(/\.lp-bubble\[data-clipped\]\s*{[^}]*opacity: 0/);
  });
});
