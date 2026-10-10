import { MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityFrame } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityWatchView } from "../../state/activity-watch";
import { ActivitySection } from "./activity-section";

const now = Date.now();
const lastMinute = toActivityPointStarts(now).minute - MINUTE_MS;

const audienceDay = {
  visits: 12,
  phoneVisits: 5,
  visitMinutes: 80,
  activeAccounts: 4,
  activePlayers: 2,
  activeStreamers: 1,
};

const frame: ActivityFrame = {
  t: "activity",
  now: { people: 6, guests: 3, streamed: 1, pixels: 87, signups: 2 },
  audience: { today: audienceDay, month: audienceDay },
  canvases: [
    {
      canvasId: "c1",
      owner: { userId: "1", login: "kalyss", displayName: "Kalyss" },
      isStreamed: true,
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
  // Montre, de haut en bas, les chiffres de l'instant, l'audience, les canvas, puis les courbes de la période
  it("shows, top to bottom, the numbers of the moment, the audience, the canvases, then the curves of the period", () => {
    const markup = render({
      activity: frame,
      period: "day",
      history: {
        status: "ready",
        points: [
          {
            at: lastMinute,
            people: 6,
            streamed: 1,
            pixels: 87,
            signups: 2,
            visits: 0,
            phoneVisits: 0,
            visitMinutes: 0,
          },
        ],
      },
    });

    const order = [
      "Maintenant",
      "dont 3 invités",
      "L'audience",
      "Visites",
      "Les fresques",
      "Kalyss",
      "120 px/h",
      "L'historique",
      "24 h",
    ];
    const positions = order.map((text) => markup.indexOf(text.replace("'", "&#x27;")));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(markup).toContain("lp-time-chart-line");
    expect(markup).not.toContain("lp-badge");
  });

  // Montre l'audience dans un tableau, une ligne par chiffre, aujourd'hui et 30 jours en colonnes
  it("shows the audience in a table, a row per figure, today and 30 days as columns", () => {
    const markup = render({ activity: frame, period: "day", history: { status: "loading" } });

    const table = markup.slice(markup.indexOf("<table"), markup.indexOf("</table>"));
    expect(table).toContain("Aujourd&#x27;hui");
    expect(table).toContain("30 jours");
    expect(table.match(/<tr/g)).toHaveLength(7);
    expect(table.match(/scope="col"/g)).toHaveLength(3);
    expect(table.match(/scope="row"/g)).toHaveLength(6);
    for (const text of [
      "Visites",
      "dont 42 % au téléphone",
      "Temps passé",
      "1 h 20 min",
      "Durée moyenne d&#x27;une visite",
      "6 min 40 s",
      "Comptes actifs",
      "Joueurs actifs",
      "Streamers actifs",
    ])
      expect(table).toContain(text);
  });

  // Ne montre que six courbes sur 24 h, et neuf sur Tout avec les comptes, joueurs et streamers actifs
  it("shows six curves over 24 h, and nine over All with the active accounts, players and streamers", () => {
    const point = { at: lastMinute, people: 6, streamed: 1, pixels: 87, signups: 2 };
    const day = { ...point, visits: 3, phoneVisits: 1, visitMinutes: 9 };
    const ready = (period: "day" | "all", extra: object) => ({
      activity: frame,
      period,
      history: { status: "ready" as const, points: [{ ...day, ...extra }] },
    });

    const charts = (markup: string) => markup.match(/<figure/g)?.length;

    expect(charts(render(ready("day", {})))).toBe(6);
    expect(charts(render(ready("all", { activeAccounts: 4, activePlayers: 2, activeStreamers: 1 })))).toBe(9);
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : un seul état, « streamé » : une tuile sans « dont N en live », aucune pastille sur la ligne, une seule courbe de canvas
  it("tells the streamed canvases alone, with no badge on the row, and draws no live curve", () => {
    const point = {
      at: lastMinute,
      people: 6,
      streamed: 3,
      pixels: 87,
      signups: 2,
      visits: 0,
      phoneVisits: 0,
      visitMinutes: 0,
    };
    const idle = {
      ...frame,
      now: { ...frame.now, streamed: 0 },
      canvases: frame.canvases.map((canvas) => ({ ...canvas, isStreamed: false })),
    };

    const markup = render({ activity: frame, period: "day", history: { status: "ready", points: [point] } });
    const notStreamed = render({ activity: idle, period: "day", history: { status: "loading" } });

    expect(markup).toContain("Fresques streamées");
    expect(markup).not.toContain("en live");
    expect(markup).not.toContain("En live");
    expect(markup).not.toContain("Fresques en live");
    expect(markup).not.toContain(">Streamé<");
    expect(markup).not.toContain("lp-badge");
    expect(markup).not.toContain('title="1 vue OBS ouverte"');
    expect(markup.match(/<figure/g)).toHaveLength(6);
    expect(markup).not.toContain(">OBS<");
    expect(notStreamed).not.toContain("lp-badge");
    expect(notStreamed).toContain("Fresques streamées");
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
    expect(waiting).not.toContain("<table");
    expect(waiting).toContain("L&#x27;historique n&#x27;a pas pu se charger.");
  });
});
