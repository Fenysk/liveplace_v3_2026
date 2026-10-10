import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Scoreboard } from "../../state/canvas-store";
import { type ScoreboardRows, toScoreboardRows } from "../../state/scoreboard";
import { ScoreboardPill, type ScoreboardPillProps } from "./scoreboard-pill";

const doNothing = (): void => undefined;

const top = [
  { login: "ada", displayName: "Ada", avatarUrl: "https://static-cdn.jtvnw.net/ada.png", pixels: 1204 },
  { login: "bob", displayName: "Bob", pixels: 40 },
  { login: "eve", displayName: "Eve", pixels: 40 },
  { login: "kim", displayName: "Kim", pixels: 7 },
  { login: "lea", displayName: "Léa", pixels: 3 },
];
const me = { login: "moi", displayName: "Moi" };

const rowsOf = (scoreboard: Scoreboard = { top }): ScoreboardRows => toScoreboardRows(scoreboard, me);

const render = (rows: ScoreboardRows, props: Partial<ScoreboardPillProps> = {}): string =>
  renderToStaticMarkup(
    createElement(ScoreboardPill, { rows, isCollapsed: false, onToggle: doNothing, ...props }),
  );

const labelsOf = (markup: string): string[] =>
  [...markup.matchAll(/class="lp-rank-main" aria-label="([^"]*)"/g)].map(([, label]) => label ?? "");

const itemsOf = (markup: string): string[] =>
  [...markup.matchAll(/<li [^>]*class="lp-rank[ "][^>]*>.*?<\/li>/gs)].map(([item]) => item);

describe("la pill Classement (JOURNAL 2026-10-06)", () => {
  // Est une vraie liste ordonnée nommée Classement, une entrée par joueur dans l'ordre, chacune nommée en entier
  it("is a real ordered list named Classement, one item per player in order, each fully named", () => {
    const markup = render(rowsOf());

    expect(markup).toMatch(/<ol [^>]*aria-label="Classement"/);
    expect(labelsOf(markup)).toEqual([
      `1er, Ada, ${(1204).toLocaleString("fr-FR")} pixels`,
      "2e, Bob, 40 pixels",
      "3e, Eve, 40 pixels",
      "4e, Kim, 7 pixels",
      "5e, Léa, 3 pixels",
    ]);
    expect(markup).not.toContain("#");
  });

  // Pose au centre à gauche, en colonne
  it("sits at the center left, in a column", () => {
    const markup = render(rowsOf());

    expect(markup).toContain('data-dock="cl"');
    expect(markup).toContain("lp-col");
    expect(render(rowsOf(), { isDocked: false })).not.toContain("data-dock");
  });

  // Entoure les trois premiers d'un anneau or, argent, bronze, et aucun autre
  it("rings the first three in gold, silver and bronze, and no other", () => {
    const rings = itemsOf(render(rowsOf())).map(
      (item) => /lp-rank-ring( lp-rank-ring--(\d))?"/.exec(item)?.[2],
    );

    expect(rings).toEqual(["1", "2", "3", undefined, undefined]);
  });

  // Ne met un anneau qu'au podium, jamais à la ligne du joueur : elle est teintée, dans le top comme à part
  it("rings only the podium, never the player's own row: it is tinted, in the top or apart", () => {
    const ringOf = (item: string | undefined) => /lp-rank-ring( lp-rank-ring--(\d))?"/.exec(item ?? "")?.[2];
    const fourth = itemsOf(render(rowsOf({ top, you: { rank: 4, pixels: 7 } })));
    const apart = itemsOf(render(rowsOf({ top, you: { rank: 12, pixels: 2 } })));
    const third = itemsOf(render(rowsOf({ top, you: { rank: 3, pixels: 40 } })));

    expect(fourth.map(ringOf)).toEqual(["1", "2", "3", undefined, undefined]);
    expect(fourth[3]).toContain("lp-rank is-me");
    expect(ringOf(apart[5])).toBeUndefined();
    expect(apart[5]).toContain("is-me");
    expect(third.map(ringOf)).toEqual(["1", "2", "3", undefined, undefined]);
  });

  // Ne donne le Tab qu'à un avatar, que les flèches quittent pour les autres
  it("gives the Tab to a single avatar, which the arrows leave for the others", () => {
    const tabIndexes = [...render(rowsOf()).matchAll(/class="lp-rank-main"[^>]*tabindex="(-?\d)"/g)].map(
      ([, tabIndex]) => tabIndex,
    );

    expect(tabIndexes).toEqual(["0", "-1", "-1", "-1", "-1"]);
  });

  // Déplié : le pseudo et le nombre de pixels de chaque ligne, ni indice de rang ni étiquette du survol, et un contrôle
  // qui propose de replier
  it("unfolded: the name and the pixels of each row, no rank hint nor hover label, and a control that offers to fold", () => {
    const markup = render(rowsOf());

    expect(markup).not.toContain("lp-rank-badge");
    expect(markup).not.toContain("lp-rank-tip");
    expect(markup).not.toContain("lp-rank-sup");
    expect(itemsOf(markup).map((item) => /lp-rank-name lp-type-body">([^<]*)</.exec(item)?.[1])).toEqual([
      "Ada",
      "Bob",
      "Eve",
      "Kim",
      "Léa",
    ]);
    expect(
      itemsOf(markup).map(
        (item) =>
          /lp-rank-pixels lp-type-numeric lp-muted" aria-hidden="true"><span class="lp-rolling"><span class="lp-visually-hidden">([^<]*)</.exec(
            item,
          )?.[1],
      ),
    ).toEqual([(1204).toLocaleString("fr-FR"), "40", "40", "7", "3"]);
    expect(markup).toContain('data-collapsed="false"');
    expect(markup).toMatch(/<button [^>]*aria-expanded="true"[^>]*>/);
    expect(markup).toContain('aria-label="Replier le classement"');
  });

  // Replié : les avatars restent dans l'ordre, chacun avec son rang en indice, et le contrôle propose de déplier
  it("folded: the avatars stay in order, each with its rank as a hint, and the control offers to unfold", () => {
    const markup = render(rowsOf(), { isCollapsed: true });

    expect(
      [...markup.matchAll(/<span class="lp-rank-badge[^>]*>(\d+)<\/span>/g)].map(([, rank]) => rank),
    ).toEqual(["1", "2", "3", "4", "5"]);
    expect(labelsOf(markup)).toHaveLength(5);
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toMatch(/<button [^>]*aria-expanded="false"[^>]*>/);
    expect(markup).toContain('aria-label="Déplier le classement"');
    expect(markup).toContain("lp-rank-ring--3");
    expect(markup).not.toContain("lp-rank-name");
    expect(markup).not.toContain("lp-rank-pixels");
  });

  // Met en évidence sa propre ligne à sa place dans le top, et elle seule
  it("highlights one's own row at its place in the top, and only that one", () => {
    const markup = render(rowsOf({ top, you: { rank: 3, pixels: 40 } }));
    const current = itemsOf(markup).filter((item) => item.includes('aria-current="true"'));

    expect(current).toHaveLength(1);
    expect(current[0]).toContain("3e, Eve");
    expect(markup).not.toContain("lp-rank--outside");
  });

  // Met sa place à part sous le top quand on n'y est pas, avec son rang écrit, même déplié
  it("puts one's place apart below the top when outside it, with the rank written, even unfolded", () => {
    const markup = render(rowsOf({ top, you: { rank: 12, pixels: 2 } }));
    const items = itemsOf(markup);

    expect(items).toHaveLength(6);
    expect(items.slice(0, 5).some((item) => item.includes("aria-current"))).toBe(false);
    expect(items[5]).toContain("lp-rank--outside");
    expect(items[5]).toContain('aria-current="true"');
    expect(items[5]).toContain("12e, Moi, 2 pixels");
    expect(items[5]).toContain('lp-type-numeric lp-muted">12<sup class="lp-rank-sup">e</sup>');
    expect(items[5]).not.toContain("lp-rank-badge");
    expect(items.slice(0, 5).some((item) => item.includes("lp-rank-sup"))).toBe(false);
    expect(render(rowsOf({ top, you: { rank: 12, pixels: 2 } }), { isCollapsed: true })).toContain(
      ">12</span>",
    );
  });

  // N'ajoute rien pour un invité, ni pour un connecté qui n'a rien posé
  it("adds nothing for a guest, nor for a signed-in player who placed nothing", () => {
    const markup = render(toScoreboardRows({ top }, undefined));

    expect(itemsOf(markup)).toHaveLength(5);
    expect(markup).not.toContain("aria-current");
    expect(markup).not.toContain("lp-rank--outside");
  });

  // Replié, écrit au survol le pseudo, puis le rang et les pixels en français, sans que le lecteur d'écran le répète
  it("folded, writes on hover the name, then the rank and the pixels in French, without a screen reader repeating it", () => {
    const [first] = itemsOf(render(rowsOf(), { isCollapsed: true }));

    expect(first).toContain('<span class="lp-rank-tip" aria-hidden="true">');
    expect(first).toContain(">Ada</span>");
    expect(first).toContain(
      `1<sup class="lp-rank-sup">er</sup> · <span class="lp-rolling"><span class="lp-visually-hidden">${(1204).toLocaleString("fr-FR")} pixels</span>`,
    );
  });

  // Tronque un pseudo long dans la ligne dépliée, et garde le pseudo entier dans le nom accessible
  it("truncates a long name in the unfolded row, and keeps the whole name in the accessible name", () => {
    const longName = "adventurouscastingfrmsqgc";
    const markup = render(
      toScoreboardRows({ top: [{ login: longName, displayName: longName, pixels: 5 }] }, me),
    );

    expect(markup).toContain(`aria-label="1er, ${longName}, 5 pixels"`);
    expect(markup).toContain(`<span class="lp-rank-name lp-type-body">${longName}</span>`);
  });

  // Montre sa photo quand il en a une, et son initiale sinon
  it("shows the photo of a player who has one, and the initial otherwise", () => {
    const [first, second] = itemsOf(render(rowsOf()));

    expect(first).toContain('src="https://static-cdn.jtvnw.net/ada.png"');
    expect(second).not.toContain("<img");
    expect(second).toContain(">B<");
  });

  // Ne rend rien tant que personne n'a posé
  it("renders nothing while nobody has placed", () => {
    expect(render(rowsOf({ top: [] }))).toBe("");
    expect(render(toScoreboardRows(undefined, me))).toBe("");
  });
});
