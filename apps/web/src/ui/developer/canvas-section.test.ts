import { HOUR_MS, MINUTE_MS, toActivityPointStarts, toPreviousDayStart } from "@liveplace/domain";
import type {
  ActivityDay,
  ActivityFrame,
  ActivityHere,
  CanvasActivityPoint,
  CanvasDayPoint,
} from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityWatchView } from "../../state/activity-watch";
import { CanvasSection } from "./canvas-section";

const now = Date.now();
const lastMinute = toActivityPointStarts(now).minute - MINUTE_MS;

const audienceDay = { visits: 12, phoneVisits: 5, visitMinutes: 80, activePlayers: 2, signups: 1 };

const here: ActivityHere = {
  canvasId: "c1",
  owner: { userId: "1", login: "kalyss", displayName: "Kalyss" },
  isStreamed: true,
  obsViews: 1,
  people: 4,
  guests: 2,
  heat: 120,
  pixels: 87,
  accounts: [
    {
      userId: "2",
      login: "moth",
      displayName: "Moth",
      role: "moderator",
      connectedAt: now - 12 * MINUTE_MS,
      devices: ["desktop", "phone"],
    },
    { userId: "3", login: "ada", displayName: "Ada", role: "viewer", connectedAt: now, devices: ["phone"] },
  ],
  audience: { today: audienceDay, month: audienceDay },
};

const noAudience = {
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  activeAccounts: 0,
  activePlayers: 0,
  activeStreamers: 0,
};

const frame = (shown: ActivityHere | null): ActivityFrame => ({
  t: "activity",
  now: { people: 6, guests: 3, streamed: 1, pixels: 87, signups: 2 },
  audience: { today: noAudience, month: noAudience },
  canvases: [],
  ...(shown ? { here: shown } : {}),
});

const canvasPoint: CanvasActivityPoint = {
  at: lastMinute,
  people: 3,
  streamedMinutes: 0,
  pixels: 40,
  visits: 2,
  visitMinutes: 7,
  signups: 1,
};

const ready = (
  period: "day" | "all",
  canvasPoints: CanvasActivityPoint[] | undefined,
  shown: ActivityHere | null = here,
): ActivityWatchView => ({
  activity: frame(shown),
  period,
  history: { status: "ready", points: [], ...(canvasPoints ? { canvasPoints } : {}) },
});

const render = (view: ActivityWatchView): string =>
  renderToStaticMarkup(
    createElement(CanvasSection, {
      view,
      nowMs: now,
      onSelectPeriod: () => undefined,
      onSelectDay: () => undefined,
    }),
  );

describe("the canvas section (JOURNAL 2026-10-07)", () => {
  // Montre, de haut en bas, le streamer, les chiffres de l'instant, l'audience, qui est là, puis les courbes
  it("shows, top to bottom, the owner, the numbers of the moment, the audience, who is there, then the curves", () => {
    const markup = render(ready("day", [canvasPoint]));

    const order = [
      "Kalyss",
      "Maintenant",
      "dont 2 invités",
      "Vues OBS ouvertes",
      "Pixels de la dernière minute",
      "Température",
      "L'audience",
      "Visites",
      "Qui est là",
      "Moth",
      "Modérateur · depuis 12 min",
      "+ 2 invités",
      "L'historique",
      "24 h",
    ];
    const positions = order.map((text) => markup.indexOf(text.replace("'", "&#x27;")));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(markup).toContain("lp-time-chart-line");
  });

  // Montre l'audience du canvas dans le même tableau, cinq lignes : les visites, le temps passé, sa durée moyenne, les joueurs actifs et les nouveaux comptes venus de sa page
  it("shows the audience of the canvas in the same table, five rows: visits, time spent, its average, active players and signups from its page", () => {
    const markup = render(ready("day", []));

    const table = markup.slice(markup.indexOf("<table"), markup.indexOf("</table>"));
    expect(table).toContain("30 jours");
    expect(table.match(/<tr/g)).toHaveLength(6);
    expect(table.match(/scope="row"/g)).toHaveLength(5);
    for (const text of [
      "dont 42 % au téléphone",
      "1 h 20 min",
      "6 min 40 s",
      "Joueurs actifs",
      "Nouveaux comptes venus de sa page",
    ])
      expect(table).toContain(text);
    expect(table).not.toContain("Comptes actifs");
    expect(table).not.toContain("Streamers actifs");
  });

  // Écart §5.1 (JOURNAL 2026-10-08) : en tête, le streamer seul, sans pastille ; une courbe de ses minutes streamées, aucune de ses vues OBS
  it("puts the owner alone at the top, with no badge, and draws its streamed minutes, not its OBS views", () => {
    const streamed = render(ready("day", [{ ...canvasPoint, streamedMinutes: 1 }]));

    const top = streamed.slice(0, streamed.indexOf("Maintenant"));
    expect(top).toContain("Kalyss");
    expect(top).not.toContain(">Streamé<");
    expect(top).not.toContain("lp-badge");
    expect(top).not.toContain('title="1 vue OBS ouverte"');
    expect(top).not.toContain(">OBS<");
    expect(top).not.toContain("En live");
    expect(streamed).toContain("Temps streamé (min)");
    expect(streamed).not.toContain("Temps en live");
    expect(streamed.match(/Vues OBS ouvertes/g)).toHaveLength(1);
  });

  // Ne met pas de pastille à un canvas non streamé, même avec une vue OBS ouverte, et dit que personne n'est là quand personne n'y est
  it("puts no badge on a canvas that is not streamed, even with an OBS view open, and says nobody is there when nobody is", () => {
    const empty = { ...here, isStreamed: false, obsViews: 0, guests: 0, people: 0, accounts: [] };

    const openView = render(ready("day", [], { ...here, isStreamed: false }));
    const markup = render(ready("day", [], empty));

    expect(openView).not.toContain("lp-badge");
    expect(openView).toContain("Vues OBS ouvertes");
    expect(markup).not.toContain("lp-badge");
    expect(markup).toContain("Personne sur cette fresque en ce moment.");
    expect(markup).not.toContain("+ 0 invité");
  });

  // Montre six courbes sur 24 h, sept sur Tout avec les joueurs actifs, et dit quand le canvas n'a eu aucune activité
  it("shows six curves over 24 h, seven over All with the active players, and says when the canvas had no activity", () => {
    const charts = (markup: string) => markup.match(/<figure/g)?.length;

    expect(charts(render(ready("day", [canvasPoint])))).toBe(6);
    expect(charts(render(ready("all", [{ ...canvasPoint, activePlayers: 2 }])))).toBe(7);
    const none = render(ready("day", []));
    expect(charts(none)).toBeUndefined();
    expect(none).toContain("Aucune activité sur cette fresque sur cette période.");
  });

  // Dit simplement qu'il n'y a rien à montrer quand la socket n'a pas de canvas, sans tableau ni courbes
  it("simply says there is nothing to show when the socket has no canvas, with no table and no curves", () => {
    const markup = render(ready("day", [canvasPoint], null));

    expect(markup).toContain("Les chiffres de cette fresque ne sont pas disponibles pour l&#x27;instant.");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("<figure");
  });

  // Dit que l'historique du canvas n'est pas là quand le gateway est d'avant, et attend la première frame sans rien inventer
  it("says the history of the canvas is not there when the gateway is from before, and waits for the first frame without making anything up", () => {
    const before = render(ready("day", undefined));
    const waiting = render({ activity: null, period: "day", history: { status: "loading" } });

    expect(before).toContain("L&#x27;historique de cette fresque n&#x27;est pas disponible.");
    expect(before).not.toContain("<figure");
    expect(waiting).toContain("Chargement…");
    expect(waiting.split('class="lp-stat-tile"').length - 1).toBe(4);
    expect(waiting).not.toContain("Personnes connectées");
    expect(waiting).not.toContain("<table");
  });
});

// JOURNAL 2026-10-14 : Cette fresque un jour passé, au lieu de l'instant, de Qui est là et des courbes glissantes.
describe("the canvas section on a past day (JOURNAL 2026-10-14)", () => {
  const dayNow = Date.UTC(2026, 9, 14, 10, 30); // 12 h 30 à Paris
  const yesterdayAt = toPreviousDayStart(toActivityPointStarts(dayNow).day);
  const hereDay: CanvasDayPoint = {
    at: yesterdayAt,
    people: 9,
    streamedMinutes: 215,
    pixels: 1840,
    visits: 23,
    phoneVisits: 9,
    visitMinutes: 330,
    signups: 3,
    activePlayers: 11,
  };
  const curvePoint: CanvasActivityPoint = {
    at: yesterdayAt + 10 * HOUR_MS,
    people: 3,
    streamedMinutes: 1,
    pixels: 40,
    visits: 2,
    visitMinutes: 7,
    signups: 0,
  };
  const day = (changes: Partial<ActivityDay["here"]> = {}): ActivityDay => ({
    dayAt: yesterdayAt,
    grain: "minute",
    points: [],
    canvases: [],
    here: { canvasId: "c1", grain: "minute", point: hereDay, points: [curvePoint], ...changes },
  });
  const renderPast = (past: ActivityWatchView["past"], shown: ActivityHere | null = here) =>
    renderToStaticMarkup(
      createElement(CanvasSection, {
        view: {
          activity: frame(shown),
          period: "day",
          history: { status: "loading" },
          past,
        },
        nowMs: dayNow,
        onSelectPeriod: () => undefined,
        onSelectDay: () => undefined,
      }),
    );
  const ready = (changes: Partial<ActivityDay["here"]> = {}, shown: ActivityHere | null = here) =>
    renderPast({ dayAt: yesterdayAt, day: { status: "ready", ...day(changes) } }, shown);

  // Montre, de haut en bas, le jour, le streamer, ses chiffres du jour, son audience, puis ses courbes : pas de Qui est là
  it("shows, top to bottom, the day, the owner, its figures, its audience, then its curves, with no Qui est là", () => {
    const markup = ready();

    const order = [
      "Hier",
      "Kalyss",
      "Ce jour-là",
      "Pic de personnes connectées",
      "Minutes streamées",
      "Pixels posés",
      "Nouveaux comptes venus de sa page",
      "L&#x27;audience",
      "Visites",
      "L&#x27;historique",
    ];
    const positions = order.map((text) => markup.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    for (const absent of [
      "Qui est là",
      "Maintenant",
      "Vues OBS ouvertes",
      "Température",
      "Moth",
      "lp-segmented",
    ])
      expect(markup).not.toContain(absent);
    expect(markup).toContain("3 h 35 min");
    expect(markup.match(/<figure/g)).toHaveLength(6);
  });

  // Garde le streamer de l'instant en tête, avec son live comme aujourd'hui
  it("keeps the owner of the moment on top, with his live as today", () => {
    const live = { ...here, owner: { ...here.owner, twitchLive: { category: "Art" } } };

    expect(ready({}, live)).toContain("lp-btn--live");
    expect(ready()).not.toContain("lp-btn--live");
  });

  // Titre l'unique colonne de l'audience par la date du jour, avec les cinq chiffres de la fresque
  it("titles the single column of the audience by the date of the day, with the five figures of the canvas", () => {
    const markup = ready();

    const table = markup.slice(markup.indexOf("<table"), markup.indexOf("</table>"));
    expect(table.match(/scope="col"/g)).toHaveLength(2);
    expect(table).toContain("mar. 13 oct.");
    expect(table).not.toContain("30 jours");
    expect(table.match(/scope="row"/g)).toHaveLength(5);
    for (const text of [
      "Joueurs actifs",
      "11",
      "Nouveaux comptes venus de sa page",
      "dont 39 % au téléphone",
    ])
      expect(table).toContain(text);
  });

  // Dit « Aucune activité sur cette fresque ce jour-là » quand elle n'a pas de point, sans tuile ni tableau ni courbe
  it("says there was no activity on the canvas that day when it has no point, with no tile, table or curve", () => {
    const markup = ready({ point: undefined, points: [] });

    expect(markup).toContain("Aucune activité sur cette fresque ce jour-là.");
    expect(markup).toContain("Kalyss");
    for (const absent of ["<table", "<figure", "lp-stat-tile", "Ce jour-là"])
      expect(markup).not.toContain(absent);
  });

  // Dit que les courbes ne sont plus gardées quand le jour est hors des 2 jours de minutes et des heures, avec ses totaux
  it("says the curves are no longer kept when the day is past the retention, with its totals", () => {
    const markup = ready({ grain: "none", points: [] });

    expect(markup).toContain("Les courbes de ce jour ne sont plus gardées, seulement ses totaux.");
    expect(markup).not.toContain("<figure");
    expect(markup).toContain("<table");
  });

  // Montre les squelettes au premier chargement, le streamer déjà là ; dit l'échec d'un jour
  it("shows the skeletons at the first loading, the owner already there, and tells the failure of a day", () => {
    const loading = renderPast({ dayAt: yesterdayAt, day: { status: "loading" } });
    const failed = renderPast({ dayAt: yesterdayAt, day: { status: "failed" } });
    const waiting = renderPast({ dayAt: yesterdayAt, day: { status: "loading" } }, null);

    expect(loading).toContain("Chargement…");
    expect(loading).toContain("Kalyss");
    expect(loading).not.toContain("<table");
    expect(failed).toContain("Ce jour n&#x27;a pas pu se charger.");
    expect(waiting).not.toContain("Kalyss");
    expect(waiting).toContain("Hier");
  });
});
