import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Window } from "../design/window";
import { DEVELOPER_SECTIONS, type DeveloperSectionId, DeveloperWindow } from "./developer-window";

const doNothing = (): void => undefined;

// Le contenu de la section : les fenêtres le demandent dans leurs props, que `createElement` n'accepte qu'ainsi.
const content = { children: createElement("p", null, "contenu") };

const render = (sectionId: DeveloperSectionId): string =>
  renderToStaticMarkup(
    createElement(DeveloperWindow, {
      isOpen: false,
      sectionId,
      onSelect: doNothing,
      onClose: doNothing,
      ...content,
    }),
  );

// Les boutons de la barre latérale, chacun avec son libellé et s'il est la page courante.
const toNavButtons = (markup: string) =>
  markup
    .split("<button")
    .slice(1)
    .map((button) => ({
      isCurrent: button.includes('aria-current="page"'),
      text: button.replace(/<[^>]*>/g, " "),
    }))
    .filter(({ text }) => text.includes("Ce canvas") || text.includes("Tout LivePlace"));

describe("the developer window (JOURNAL 2026-10-07)", () => {
  // Offre deux sections, Ce canvas puis Tout LivePlace, dans la grande fenêtre
  it("offers two sections, Ce canvas then Tout LivePlace, in the large window", () => {
    const markup = render("here");

    expect(DEVELOPER_SECTIONS.map(({ id, label }) => `${id}:${label}`)).toEqual([
      "here:Ce canvas",
      "all:Tout LivePlace",
    ]);
    expect(markup).toContain("lp-window--large");
    expect(markup.indexOf("Ce canvas")).toBeLessThan(markup.indexOf("Tout LivePlace"));
    expect(markup).toContain("contenu");
  });

  // Marque comme courante la section choisie, et la nomme dans l'en-tête
  it("marks the chosen section as current, and names it in the header", () => {
    for (const [sectionId, label] of [
      ["here", "Ce canvas"],
      ["all", "Tout LivePlace"],
    ] as const) {
      const markup = render(sectionId);

      const current = toNavButtons(markup).filter(({ isCurrent }) => isCurrent);
      expect(current).toHaveLength(1);
      expect(current[0]?.text).toContain(label);
      expect(markup).toMatch(new RegExp(`<h2[^>]*>${label}</h2>`));
    }
  });

  // Garde la taille des autres fenêtres : la grande n'est que celle du développeur
  it("keeps the size of the other windows: the large one is the developer's alone", () => {
    const plain = renderToStaticMarkup(
      createElement(Window, {
        isOpen: false,
        sections: DEVELOPER_SECTIONS,
        sectionId: "here",
        onSelect: doNothing,
        onClose: doNothing,
        ...content,
      }),
    );

    expect(plain).not.toContain("lp-window--large");
    expect(plain).toContain("lp-window");
  });
});
