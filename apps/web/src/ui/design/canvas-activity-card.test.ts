import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasActivityOwner } from "./canvas-activity-card";

const owner = { userId: "1", login: "kalyss", displayName: "Kalyss" };

describe("the owner of a canvas in the developer's activity (Écart §4, JOURNAL 2026-10-07)", () => {
  // Un streamer en live montre le bouton Twitch teinté avec sa catégorie ; hors live, rien ne change
  it("shows the tinted Twitch button with the category for an owner who is live, and nothing otherwise", () => {
    const live = renderToString(
      createElement(CanvasActivityOwner, {
        owner: { ...owner, twitchLive: { category: "Art" } },
        obsTitle: null,
        isLive: false,
      }),
    );
    const notLive = renderToString(
      createElement(CanvasActivityOwner, { owner, obsTitle: null, isLive: false }),
    );

    expect(live).toContain("lp-btn--live");
    expect(live).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(notLive).not.toContain("lp-btn--live");
    expect(notLive).not.toContain("twitch.tv");
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : la pastille « En live » vient après la pastille OBS, teintée du live ; sans live, elle n'existe pas
  it("puts the live badge after the OBS badge, tinted as the live is, and none when the canvas is not live", () => {
    const render = (obsTitle: string | null, isLive: boolean) =>
      renderToString(createElement(CanvasActivityOwner, { owner, obsTitle, isLive }));

    const both = render("1 vue OBS ouverte", true);
    const streamed = render("1 vue OBS ouverte", false);
    const neither = render(null, false);

    expect(both.indexOf(">OBS<")).toBeGreaterThan(-1);
    expect(both.indexOf(">OBS<")).toBeLessThan(both.indexOf(">En live<"));
    expect(both).toContain("lp-badge--live");
    expect(streamed).toContain(">OBS<");
    expect(streamed).not.toContain("En live");
    expect(neither).not.toContain("lp-badge");
  });
});
