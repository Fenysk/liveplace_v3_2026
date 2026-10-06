import { MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityFrame } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityWatchView } from "../../state/activity-watch";
import { ActivitySection } from "./activity-section";

const now = Date.now();
const lastMinute = toActivityPointStarts(now).minute - MINUTE_MS;

const frame: ActivityFrame = {
  t: "activity",
  now: { people: 6, guests: 3, streamed: 1, pixels: 87, signups: 2 },
  canvases: [
    {
      canvasId: "c1",
      owner: { userId: "1", login: "kalyss", displayName: "Kalyss" },
      obsViews: 1,
      people: 4,
      guests: 1,
      heat: 120,
      signups: 1,
      accounts: [],
    },
  ],
};

const render = (view: ActivityWatchView): string =>
  renderToStaticMarkup(createElement(ActivitySection, { view, nowMs: now, onSelectPeriod: () => undefined }));

describe("the activity section (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Montre, de haut en bas, les chiffres de l'instant, les canvas, puis les courbes de la période
  it("shows, top to bottom, the numbers of the moment, the canvases, then the curves of the period", () => {
    const markup = render({
      activity: frame,
      period: "day",
      history: {
        status: "ready",
        points: [{ at: lastMinute, people: 6, streamed: 1, pixels: 87, signups: 2 }],
      },
    });

    const order = [
      "Maintenant",
      "dont 3 invités",
      "Les canvas",
      "Kalyss",
      "120 px/h",
      "L'historique",
      "24 h",
    ];
    const positions = order.map((text) => markup.indexOf(text.replace("'", "&#x27;")));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(markup).toContain("lp-time-chart-line");
    expect(markup).toContain(">OBS<");
  });

  // Dit quand personne n'est sur LivePlace, et attend la première frame sans rien inventer
  it("says when nobody is on LivePlace, and waits for the first frame without making anything up", () => {
    const empty = render({
      activity: { ...frame, canvases: [] },
      period: "day",
      history: { status: "loading" },
    });
    const waiting = render({ activity: null, period: "all", history: { status: "failed" } });

    expect(empty).toContain("Personne sur LivePlace en ce moment.");
    expect(waiting).toContain("Chargement…");
    expect(waiting).not.toContain("Personnes connectées");
    expect(waiting).toContain("L&#x27;historique n&#x27;a pas pu se charger.");
  });
});
