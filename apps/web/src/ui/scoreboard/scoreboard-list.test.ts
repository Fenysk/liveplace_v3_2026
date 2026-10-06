import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toScoreboardRows } from "../../state/scoreboard";
import { ScoreboardList } from "./scoreboard-list";

const top = [
  { login: "ada", displayName: "Ada", avatarUrl: "https://static-cdn.jtvnw.net/ada.png", pixels: 1204 },
  { login: "bob", displayName: "Bob", pixels: 1 },
];
const me = { login: "moi", displayName: "Moi" };

const render = (scoreboard: Parameters<typeof toScoreboardRows>[0]): string =>
  renderToStaticMarkup(createElement(ScoreboardList, { rows: toScoreboardRows(scoreboard, me) }));

const itemsOf = (markup: string): string[] => [...markup.matchAll(/<li .*?<\/li>/gs)].map(([item]) => item);

describe("la liste du Classement sur mobile (JOURNAL 2026-10-06)", () => {
  // Montre à chaque ligne, sans survol, l'avatar, le pseudo, le rang et les pixels
  it("shows each row, with no hover, the avatar, the name, the rank and the pixels", () => {
    const [first, second] = itemsOf(render({ top }));

    expect(first).toContain('src="https://static-cdn.jtvnw.net/ada.png"');
    expect(first).toContain(">Ada</span>");
    expect(first).toContain(`1<sup class="lp-rank-sup">er</sup> · ${(1204).toLocaleString("fr-FR")} pixels`);
    expect(second).toContain('2<sup class="lp-rank-sup">e</sup> · 1 pixel<');
  });

  // Est une liste ordonnée nommée Classement, chaque ligne dite d'un trait à un lecteur d'écran, sans dièse
  it("is an ordered list named Classement, each row said in one go to a screen reader, without a hash", () => {
    const markup = render({ top });

    expect(markup).toMatch(/^<ol [^>]*aria-label="Classement"/);
    expect(markup).toContain(
      `<span class="lp-visually-hidden">1er, Ada, ${(1204).toLocaleString("fr-FR")} pixels</span>`,
    );
    expect(markup).toContain('<span class="lp-visually-hidden">2e, Bob, 1 pixel</span>');
    expect(markup).not.toContain("#");
  });

  // Entoure les trois premiers d'un anneau, comme la colonne
  it("rings the first three, like the column", () => {
    expect(render({ top })).toContain("lp-rank-ring--1");
    expect(render({ top })).toContain("lp-rank-ring--2");
  });

  // Met sa place à part sous le top quand on n'y est pas, et la met en évidence
  it("puts one's place apart below the top when outside it, and highlights it", () => {
    const items = itemsOf(render({ top, you: { rank: 12, pixels: 37 } }));

    expect(items).toHaveLength(3);
    expect(items[2]).toContain("lp-scoreboard-row--outside");
    expect(items[2]).toContain('aria-current="true"');
    expect(items[2]).toContain("12e, Moi, 37 pixels");
  });

  // Met sa ligne en évidence à sa place quand on est dans le top
  it("highlights one's row at its place when in the top", () => {
    const items = itemsOf(render({ top, you: { rank: 2, pixels: 1 } }));

    expect(items).toHaveLength(2);
    expect(items[1]).toContain('aria-current="true"');
    expect(items[0]).not.toContain("aria-current");
  });

  // Ne montre qu'une liste vide quand personne n'a posé
  it("shows only an empty list when nobody has placed", () => {
    expect(itemsOf(render({ top: [] }))).toEqual([]);
  });
});
