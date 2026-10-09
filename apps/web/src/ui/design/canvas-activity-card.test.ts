import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasActivityCard, CanvasActivityOwner } from "./canvas-activity-card";

const owner = { userId: "1", login: "kalyss", displayName: "Kalyss" };

describe("the owner of a canvas in the developer's activity (Écart §4, JOURNAL 2026-10-07)", () => {
  // Un streamer en live montre le bouton Twitch teinté avec sa catégorie ; hors live, rien ne change
  it("shows the tinted Twitch button with the category for an owner who is live, and nothing otherwise", () => {
    const live = renderToString(
      createElement(CanvasActivityOwner, { owner: { ...owner, twitchLive: { category: "Art" } } }),
    );
    const notLive = renderToString(createElement(CanvasActivityOwner, { owner }));

    expect(live).toContain("lp-btn--live");
    expect(live).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(notLive).not.toContain("lp-btn--live");
    expect(notLive).not.toContain("twitch.tv");
  });

  // Le bouton Twitch dit seul le live : ni pastille « Streamé », ni vues OBS à côté du nom, qu'il soit en live ou non
  it("puts no badge beside the owner, live or not: the Twitch button tells the live alone", () => {
    const live = renderToString(
      createElement(CanvasActivityOwner, { owner: { ...owner, twitchLive: { category: "Art" } } }),
    );
    const notLive = renderToString(createElement(CanvasActivityOwner, { owner }));

    for (const markup of [live, notLive]) {
      expect(markup).toContain("Kalyss");
      expect(markup).not.toContain("lp-badge");
      expect(markup).not.toContain("Streamé");
      expect(markup).not.toContain("OBS");
    }
  });

  // Une ligne de canvas streamé n'a pas de pastille : son streamer, ses chiffres et le chevron, rien d'autre
  it("gives the row of a streamed canvas no badge: its owner, its figures and the chevron, nothing else", () => {
    const row = renderToString(
      createElement(CanvasActivityCard, {
        owner: { ...owner, twitchLive: { category: "Art" } },
        facts: ["3 personnes", "120 px/h"],
        accounts: [],
        guestsLine: null,
        isOpen: false,
        onToggle: () => undefined,
      }),
    );

    expect(row).toContain("lp-btn--live");
    expect(row).toContain("3 personnes");
    expect(row).toContain('title="Qui est dessus"');
    expect(row).not.toContain("lp-badge");
    expect(row).not.toContain("Streamé");
    expect(row).not.toContain("OBS");
  });
});
