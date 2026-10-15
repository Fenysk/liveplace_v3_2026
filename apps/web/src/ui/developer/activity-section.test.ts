import { HOUR_MS, MINUTE_MS, toActivityPointStarts, toPreviousDayStart } from "@liveplace/domain";
import type { ActivityDay, ActivityFrame, ActivityUser, CanvasDayPoint } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityWatchView } from "../../state/activity-watch";
import { formatCount } from "./activity-labels";
import { ActivitySection } from "./activity-section";
import { PastDayFrame, pickShownDay } from "./past-day";

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
  renderToStaticMarkup(
    createElement(ActivitySection, {
      view,
      nowMs: now,
      onSelectPeriod: () => undefined,
      onSelectDay: () => undefined,
    }),
  );

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
    expect(waiting).toContain("lp-skeleton-block--area");
    expect(waiting.split('class="lp-stat-tile"').length - 1).toBe(4);
    expect(waiting).not.toContain("Personnes connectées");
    expect(waiting).not.toContain("<table");
    expect(waiting).toContain("L&#x27;historique n&#x27;a pas pu se charger.");
  });
});

// JOURNAL 2026-10-14 : Tout LivePlace un jour passé, au lieu de l'instant et des courbes glissantes.
describe("the activity section on a past day (JOURNAL 2026-10-14)", () => {
  const dayNow = Date.UTC(2026, 9, 14, 10, 30); // 12 h 30 à Paris
  const todayAt = toActivityPointStarts(dayNow).day;
  const yesterdayAt = toPreviousDayStart(todayAt);
  const firstDayAt = toPreviousDayStart(toPreviousDayStart(toPreviousDayStart(yesterdayAt)));
  const owner = { userId: "1", login: "kalyss", displayName: "Kalyss" };
  const canvasDay = (
    canvasId: string,
    point: Partial<CanvasDayPoint>,
    withOwner: ActivityUser | undefined = undefined,
  ): ActivityDay["canvases"][number] => ({
    canvasId,
    ...(withOwner ? { owner: withOwner } : {}),
    point: {
      at: yesterdayAt,
      people: 4,
      streamedMinutes: 0,
      pixels: 10,
      visits: 3,
      phoneVisits: 1,
      visitMinutes: 12,
      signups: 0,
      activePlayers: 1,
      ...point,
    },
  });
  const dayPoint = {
    at: yesterdayAt,
    people: 14,
    streamed: 3,
    pixels: 4210,
    signups: 6,
    visits: 41,
    phoneVisits: 17,
    visitMinutes: 612,
    activeAccounts: 28,
    activePlayers: 17,
    activeStreamers: 4,
  };
  const day = (changes: Partial<ActivityDay> = {}): ActivityDay => ({
    dayAt: yesterdayAt,
    grain: "minute",
    day: dayPoint,
    points: [{ ...dayPoint, at: yesterdayAt + 10 * HOUR_MS }],
    canvases: [
      canvasDay(
        "small",
        { streamedMinutes: 40, people: 2 },
        { userId: "2", login: "moth", displayName: "Moth" },
      ),
      canvasDay("big", { streamedMinutes: 215, people: 9, pixels: 1840 }, owner),
      canvasDay("gone", { streamedMinutes: 0, people: 1 }),
    ],
    here: { canvasId: "big", grain: "minute", points: [] },
    ...changes,
  });
  const viewOf = (pastDay: ActivityWatchView["past"]): ActivityWatchView => ({
    activity: frame,
    period: "day",
    history: { status: "loading" },
    firstDayAt,
    past: pastDay,
  });
  const renderPast = (pastDay: ActivityWatchView["past"]) =>
    renderToStaticMarkup(
      createElement(ActivitySection, {
        view: viewOf(pastDay),
        nowMs: dayNow,
        onSelectPeriod: () => undefined,
        onSelectDay: () => undefined,
      }),
    );
  const ready = (changes: Partial<ActivityDay> = {}) =>
    renderPast({ dayAt: yesterdayAt, day: { status: "ready", ...day(changes) } });

  // Montre, de haut en bas, le jour, ses chiffres, l'audience, les fresques avec leur streamer, puis les courbes du jour
  it("shows, top to bottom, the day, its figures, the audience, the canvases with their owner, then the curves", () => {
    const markup = ready();

    const order = [
      "Hier",
      "Ce jour-là",
      "Pic de personnes connectées",
      "Pic de fresques streamées",
      "Pixels posés",
      "Nouveaux comptes",
      "L&#x27;audience",
      "Visites",
      "Les fresques",
      "Kalyss",
      "L&#x27;historique",
    ];
    const positions = order.map((text) => markup.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(markup).not.toContain("Maintenant");
    expect(markup).not.toContain("invités");
    expect(markup).toContain(formatCount(4210));
    expect(markup.match(/<figure/g)).toHaveLength(6);
  });

  // Ne propose pas de période sur un jour passé : les courbes sont celles du jour, de minuit à minuit
  it("offers no period on a past day: the curves are the day's, midnight to midnight", () => {
    const markup = ready();

    expect(markup).not.toContain("lp-segmented");
    expect(markup).not.toContain("24 h");
    expect(markup).not.toContain("30 jours");
  });

  // Titre l'unique colonne de l'audience par la date du jour, avec les six chiffres de tout LivePlace
  it("titles the single column of the audience by the date of the day, with the six figures of the whole", () => {
    const markup = ready();

    const table = markup.slice(markup.indexOf("<table"), markup.indexOf("</table>"));
    expect(table.match(/scope="col"/g)).toHaveLength(2);
    expect(table).toContain("mar. 13 oct.");
    expect(table).not.toContain("30 jours");
    expect(table.match(/scope="row"/g)).toHaveLength(6);
    for (const text of ["Comptes actifs", "Joueurs actifs", "Streamers actifs", "28", "17"])
      expect(table).toContain(text);
  });

  // Range les fresques par minutes streamées, sans chevron ni live, et garde « Streamer inconnu » à celle sans streamer
  it("sorts the canvases by streamed minutes, with no chevron or live, and keeps an unknown owner on its row", () => {
    const markup = ready();

    const list = markup.slice(markup.indexOf("Les fresques"), markup.indexOf("L&#x27;historique"));
    expect(list.match(/<article/g)).toHaveLength(3);
    expect(list.indexOf("Kalyss")).toBeLessThan(list.indexOf("Moth"));
    expect(list.indexOf("Moth")).toBeLessThan(list.indexOf("Streamer inconnu"));
    expect(list).toContain("3 h 35 min streamées");
    expect(list).toContain("9 personnes au pic");
    expect(list).not.toContain("Qui est dessus");
    expect(list).not.toContain("lp-btn--live");
  });

  // Dit quand aucune fresque n'était active ce jour-là
  it("says when no canvas was active that day", () => {
    const markup = ready({ canvases: [] });

    expect(markup).toContain("Aucune fresque active ce jour-là.");
    expect(markup).not.toContain("<article");
  });

  // Donne zéro aux tuiles d'un jour sans point, plutôt que d'inventer ou de cacher
  it("gives zero to the tiles of a day without a point, rather than making up or hiding", () => {
    const markup = ready({ day: undefined, points: [] });

    expect(markup).toContain("Pic de personnes connectées");
    expect(markup.split('class="lp-stat-tile"').length - 1).toBe(4);
    expect(markup).not.toContain(formatCount(4210));
  });

  // Dit que les courbes ne sont plus gardées, sans en tracer, quand le jour est hors de la rétention
  it("says the curves are no longer kept, drawing none, when the day is past the retention", () => {
    const markup = ready({ grain: "none", points: [] });

    expect(markup).toContain("Les courbes de ce jour ne sont plus gardées, seulement ses totaux.");
    expect(markup).not.toContain("<figure");
    expect(markup).toContain("Les fresques");
  });

  // Montre les squelettes au premier chargement, sans rien inventer, avec les flèches déjà là
  it("shows the skeletons at the first loading, making nothing up, with the arrows already there", () => {
    const markup = renderPast({ dayAt: yesterdayAt, day: { status: "loading" } });

    expect(markup).toContain("Chargement…");
    expect(markup).toContain("Hier");
    expect(markup).toContain("Jour précédent");
    expect(markup.split('class="lp-stat-tile"').length - 1).toBe(4);
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("Pic de personnes connectées");
  });

  // Dit l'échec de la lecture d'un jour, sans rien d'autre à la place
  it("tells the failure to read a day, with nothing else in its place", () => {
    const markup = renderPast({ dayAt: yesterdayAt, day: { status: "failed" } });

    expect(markup).toContain("Ce jour n&#x27;a pas pu se charger.");
    expect(markup).not.toContain("<table");
  });

  // Garde les flèches ouvertes vers hier depuis aujourd'hui, et fait de « précédent » et « suivant » des boutons nommés
  it("keeps the arrows named buttons, previous off on the oldest day and next off on today", () => {
    const today = renderToStaticMarkup(
      createElement(ActivitySection, {
        view: { ...viewOf(undefined), history: { status: "loading" } },
        nowMs: dayNow,
        onSelectPeriod: () => undefined,
        onSelectDay: () => undefined,
      }),
    );
    const oldest = renderPast({ dayAt: firstDayAt, day: { status: "loading" } });
    const buttons = (markup: string) =>
      markup
        .split("<button")
        .slice(1)
        .filter((button) => /aria-label="Jour (précédent|suivant)"/.test(button))
        .map((button) => [/aria-label="([^"]+)"/.exec(button)?.[1], button.includes("disabled")]);

    expect(buttons(today)).toEqual([
      ["Jour précédent", false],
      ["Jour suivant", true],
    ]);
    expect(buttons(oldest)).toEqual([
      ["Jour précédent", true],
      ["Jour suivant", false],
    ]);
  });

  // Garde le jour montré, grisé, pendant qu'un autre se charge ; ne grise rien une fois le jour là
  it("keeps the shown day, greyed, while another loads, and greys nothing once the day is there", () => {
    const shown = day();
    const framed = (pastDay: NonNullable<ActivityWatchView["past"]>["day"]) =>
      renderToStaticMarkup(
        PastDayFrame({
          past: { dayAt: yesterdayAt, day: pastDay },
          shown,
          skeleton: createElement("i"),
          children: () => createElement("b", null, "jour d'avant"),
        }),
      );
    const loading = framed({ status: "loading" });
    const there = framed({ status: "ready", ...shown });

    expect(loading).toContain("jour d&#x27;avant");
    expect(loading).toContain("is-stale");
    expect(loading).toContain('aria-busy="true"');
    expect(there).not.toContain("is-stale");
    expect(pickShownDay(shown, { dayAt: yesterdayAt, day: { status: "loading" } })).toBe(shown);
    expect(pickShownDay(shown, { dayAt: yesterdayAt, day: { status: "failed" } })).toBe(shown);
    expect(pickShownDay(null, { dayAt: yesterdayAt, day: { status: "loading" } })).toBeNull();
  });
});
