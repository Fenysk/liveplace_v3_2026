import { PALETTE } from "@liveplace/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BannedUsers } from "./banned-users";
import { ModeratorUsers } from "./moderator-users";

const noop = () => undefined;

const count = (html: string, text: string): number => html.split(text).length - 1;

describe("the moderator and banned lists while they load", () => {
  // Trois lignes grises tiennent la place des modérateurs, sous leur titre, et « Chargement… » reste pour les lecteurs d'écran
  it("shows three grey rows under the title of the moderators, read as loading by a screen reader", () => {
    const html = renderToStaticMarkup(createElement(ModeratorUsers, { list: { status: "loading" } }));

    expect(html).toContain("Modérateurs");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("lp-visually-hidden");
    expect(count(html, "lp-skeleton-block--avatar")).toBe(3);
    expect(html).not.toContain('lp-muted">Chargement');
  });

  // Les bannis ont les mêmes trois lignes
  it("shows the same three grey rows for the banned players", () => {
    const html = renderToStaticMarkup(
      createElement(BannedUsers, {
        list: { status: "loading" },
        preview: null,
        unbanningUserId: null,
        canvas: { width: 4, height: 4, palette: PALETTE },
        onPreview: noop,
        onUnban: noop,
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(count(html, "lp-skeleton-block--avatar")).toBe(3);
  });

  // Une liste prête n'a plus aucune trace d'attente
  it("keeps no trace of the wait once the list is there", () => {
    const html = renderToStaticMarkup(
      createElement(ModeratorUsers, { list: { status: "ready", users: [] } }),
    );

    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("lp-skeleton");
  });
});
