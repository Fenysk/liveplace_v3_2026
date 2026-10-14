import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FirstHint } from "./first-hint";

// Écart §8.1 (JOURNAL 2026-10-08) : le conseil de première visite, dans une bulle.

const render = (doneCount: number, isVisible = true): string =>
  renderToStaticMarkup(createElement(FirstHint, { doneCount, isVisible, isDocked: false }));

describe("le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Les deux phrases du croquis validé, chacune avec son icône
  it("says the two sentences of the validated sketch, each with its icon", () => {
    const markup = render(0);

    expect(markup).toContain("<span>Pince pour zoomer</span>");
    expect(markup).toContain("<span>Touche un pixel pour voir qui l&#x27;a posé</span>");
    expect(markup.match(/<svg/g)).toHaveLength(2);
  });

  // À la souris (Écart §8.1, JOURNAL 2026-10-12) : la molette et le clic, avec leurs icônes et les mêmes trois points
  it("says the wheel and the click with a mouse, with the same three dots", () => {
    const markup = renderToStaticMarkup(
      createElement(FirstHint, { doneCount: 1, isVisible: true, isDocked: false, isTouchScreen: false }),
    );

    expect(markup).toContain("<span>Molette pour zoomer</span>");
    expect(markup).toContain("<span>Clique sur un pixel pour voir qui l&#x27;a posé</span>");
    expect(markup).not.toContain("Pince");
    expect(markup.match(/<svg/g)).toHaveLength(2);
    expect(markup.match(/lp-hint-dot is-filled/g)).toHaveLength(1);
  });

  // Trois points sous les lignes, autant de remplis que de gestes faits
  it("shows three dots under the lines, as many filled as steps done", () => {
    for (const doneCount of [0, 1, 2, 3]) {
      const markup = render(doneCount);
      expect(markup.match(/class="lp-hint-dot[ "]/g)).toHaveLength(3);
      expect(markup.match(/lp-hint-dot is-filled/g) ?? []).toHaveLength(doneCount);
    }
  });

  // Les points se disent à voix haute, sans les lire un par un
  it("tells the progress aloud as one figure", () => {
    expect(render(2)).toContain('role="img" aria-label="2 sur 3"');
  });

  // Cachée dès le départ, elle n'est pas dans la page : elle paraîtra en fondu
  it("is not in the page while it was never shown", () => {
    expect(render(1, false)).toBe("");
  });
});
