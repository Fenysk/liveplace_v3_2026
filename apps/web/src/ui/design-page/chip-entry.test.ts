import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sentenceChips } from "../document/document-chips";
import { ChipEntry } from "./component-entries";
import { toEntry } from "./design-entries";

const html = renderToStaticMarkup(createElement(ChipEntry));
const chips = [...html.matchAll(/<span class="(lp-chip[^"]*)">/g)].map(([, className = ""]) => className);

describe("l'entrée Pastille de /design (JOURNAL 2026-11-04)", () => {
  // L'entrée s'ouvre par son slug, dans le chapitre des composants
  it("opens by its slug, under the components chapter", () => {
    expect(toEntry("#pastille")).toMatchObject({
      slug: "pastille",
      chapterId: "components",
      title: "Pastille",
    });
    expect(html).toContain(">Pastille</h1>");
  });

  // Les six pastilles, dans les deux langues, avec le nom de leur bouton : celui des textes, jamais recopié
  it("shows the six chips in French and in English, named from the texts of their buttons", () => {
    for (const locale of ["fr", "en"] as const)
      for (const { label } of Object.values(sentenceChips(locale))) expect(html).toContain(`${label}</span>`);
  });

  // Les trois couleurs : neutre, rouge de Supprimer mon compte, Twitch ; et la phrase d'exemple en ajoute deux
  it("shows each color, in the six rows and in the example sentence", () => {
    expect(chips.filter((className) => className === "lp-chip")).toHaveLength(2 * 4 + 1);
    expect(chips.filter((className) => className.endsWith("--danger"))).toHaveLength(2 + 1);
    expect(chips.filter((className) => className.endsWith("--twitch"))).toHaveLength(2);
  });
});
