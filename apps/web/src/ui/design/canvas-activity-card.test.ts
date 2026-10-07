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
      }),
    );
    const notLive = renderToString(createElement(CanvasActivityOwner, { owner, obsTitle: null }));

    expect(live).toContain("lp-btn--live");
    expect(live).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(notLive).not.toContain("lp-btn--live");
    expect(notLive).not.toContain("twitch.tv");
  });
});
