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
        streamedTitle: null,
      }),
    );
    const notLive = renderToString(createElement(CanvasActivityOwner, { owner, streamedTitle: null }));

    expect(live).toContain("lp-btn--live");
    expect(live).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(notLive).not.toContain("lp-btn--live");
    expect(notLive).not.toContain("twitch.tv");
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : une seule pastille « Streamé », teintée du live, ses vues OBS en infobulle ; sans stream, elle n'existe pas
  it("shows a single Streamé badge, tinted as the live is, with the OBS views as its tooltip, and none when the canvas is not streamed", () => {
    const render = (streamedTitle: string | null) =>
      renderToString(createElement(CanvasActivityOwner, { owner, streamedTitle }));

    const streamed = render("2 vues OBS ouvertes");
    const notStreamed = render(null);

    expect(streamed).toContain(">Streamé<");
    expect(streamed).toContain("lp-badge--live");
    expect(streamed).toContain('title="2 vues OBS ouvertes"');
    expect(streamed.match(/<span class="lp-badge/g)).toHaveLength(1);
    expect(streamed).not.toContain(">OBS<");
    expect(streamed).not.toContain("En live");
    expect(notStreamed).not.toContain("lp-badge");
  });
});
