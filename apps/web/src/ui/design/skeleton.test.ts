import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../locale/use-locale";
import { SkeletonBar, SkeletonBlock, SkeletonProfile, SkeletonSlot } from "./skeleton";
import type { SkeletonPhase } from "./use-skeleton-phase";

// Les enfants passent par un objet : `createElement` les veut dans les props, et le lint refuse `children:` écrit à la main.
const content = { children: createElement("p", null, "Kalyss") };

const slot = (phase: SkeletonPhase, locale: "fr" | "en" = "fr"): string =>
  renderToStaticMarkup(
    createElement(
      LocaleProvider,
      { initial: locale },
      createElement(SkeletonSlot, { phase, skeleton: createElement(SkeletonProfile), ...content }),
    ),
  );

describe("la place d'un contenu qui charge", () => {
  // Pendant l'attente, le conteneur dit qu'il charge et ses blocs gris se taisent
  it("says it is busy and keeps its grey blocks silent while the content loads", () => {
    const html = slot("shown");

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement…");
    expect(html).toContain("lp-skeleton-profile");
    expect(html).not.toContain("Kalyss");
    for (const shape of html.match(/<span class="lp-skeleton [^"]*"[^>]*>/g) ?? [])
      expect(shape).toContain('aria-hidden="true"');
  });

  // Avant 200 ms, le squelette est dans la page mais caché : la place du contenu est déjà prise
  it("holds the place of the content, unseen, during the first 200 ms", () => {
    const pending = slot("pending");

    expect(pending).toContain("lp-skeleton-region is-pending");
    expect(pending).toContain("lp-skeleton-block--avatar");
    expect(slot("shown")).not.toContain("is-pending");
  });

  // Une fois le contenu là, plus de squelette ni d'attente
  it("gives the content alone once the data is there", () => {
    const html = slot("ready");

    expect(html).toBe("<p>Kalyss</p>");
  });

  // Quand le contenu remplace un squelette qui s'est vu, il arrive dans un conteneur qui le fait paraître en fondu
  it("brings the content in a fading container when it replaces a skeleton that was seen", () => {
    const html = slot("revealed");

    expect(html).toBe('<div class="lp-skeleton-reveal"><p>Kalyss</p></div>');
    expect(html).not.toContain("aria-busy");
  });

  // Le mot « Chargement… » suit la langue de la page
  it("says it is loading in the language of the page", () => {
    expect(slot("shown", "en")).toContain("Loading…");
    expect(slot("shown", "en")).not.toContain("Chargement");
  });
});

describe("les formes d'un squelette", () => {
  // Une largeur de barre est une classe : la CSP de production bloque un `style` rendu par le serveur
  it("sets the width of a bar by a class, never by a style attribute", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(SkeletonBar, { width: "short" }),
        createElement(SkeletonBar, { width: "long", text: "caption" }),
        createElement(SkeletonBlock, { shape: "field" }),
      ),
    );

    expect(html).toContain("lp-skeleton-bar--short");
    expect(html).toContain("lp-skeleton-bar--long");
    expect(html).toContain("lp-type-caption");
    expect(html).toContain("lp-skeleton-block--field");
    expect(html).not.toContain("style=");
  });
});
