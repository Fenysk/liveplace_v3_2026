import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TwitchSyncBlock, type TwitchSyncView } from "./twitch-sync";

const noop = () => undefined;

const render = (sync: TwitchSyncView): string =>
  renderToStaticMarkup(createElement(TwitchSyncBlock, { sync, syncHref: "#", onSync: noop }));

describe("l'état de la synchro Twitch", () => {
  // Tant que le gateway n'a pas répondu, une barre de texte tient la place de la phrase, et le bouton reste là
  it("shows a text bar in place of its sentence while the gateway has not answered", () => {
    const html = render({ status: "loading" });

    expect(html).toContain("lp-skeleton-bar");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Synchronisation Twitch");
    expect(html).toContain("Synchroniser de nouveau");
    expect(html).not.toContain("…</p>");
  });

  // Une fois la réponse là, la phrase dit où en est la synchro, sans trace d'attente
  it("says where the sync stands once the answer is there, with no trace of the wait", () => {
    const never = render({ status: "never" });
    const revoked = render({ status: "revoked", syncedAt: 1_700_000_000_000 });

    expect(never).toContain("lp-type-caption lp-muted");
    expect(never).not.toContain("lp-skeleton");
    expect(revoked).not.toContain("aria-busy");
  });
});
