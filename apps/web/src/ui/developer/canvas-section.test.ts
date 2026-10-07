import { MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { ActivityFrame, ActivityHere, CanvasActivityPoint } from "@liveplace/domain/ports";
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
  obsViews: 1,
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
  renderToStaticMarkup(createElement(CanvasSection, { view, nowMs: now, onSelectPeriod: () => undefined }));

describe("the canvas section (JOURNAL 2026-10-07)", () => {
  // Montre, de haut en bas, le streamer avec sa pastille OBS, les chiffres de l'instant, l'audience, qui est là, puis les courbes
  it("shows, top to bottom, the owner with the OBS badge, the numbers of the moment, the audience, who is there, then the curves", () => {
    const markup = render(ready("day", [canvasPoint]));

    const order = [
      "Kalyss",
      ">OBS<",
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

  // Ne met pas de pastille OBS à un canvas non streamé, et dit que personne n'est là quand personne n'y est
  it("puts no OBS badge on a canvas that is not streamed, and says nobody is there when nobody is", () => {
    const empty = { ...here, obsViews: 0, guests: 0, people: 0, accounts: [] };

    const markup = render(ready("day", [], empty));

    expect(markup).not.toContain(">OBS<");
    expect(markup).toContain("Personne sur ce canvas en ce moment.");
    expect(markup).not.toContain("+ 0 invité");
  });

  // Montre six courbes sur 24 h, sept sur Tout avec les joueurs actifs, et dit quand le canvas n'a eu aucune activité
  it("shows six curves over 24 h, seven over All with the active players, and says when the canvas had no activity", () => {
    const charts = (markup: string) => markup.match(/<figure/g)?.length;

    expect(charts(render(ready("day", [canvasPoint])))).toBe(6);
    expect(charts(render(ready("all", [{ ...canvasPoint, activePlayers: 2 }])))).toBe(7);
    const none = render(ready("day", []));
    expect(charts(none)).toBeUndefined();
    expect(none).toContain("Aucune activité sur ce canvas sur cette période.");
  });

  // Dit simplement qu'il n'y a rien à montrer quand la socket n'a pas de canvas, sans tableau ni courbes
  it("simply says there is nothing to show when the socket has no canvas, with no table and no curves", () => {
    const markup = render(ready("day", [canvasPoint], null));

    expect(markup).toContain("Les chiffres de ce canvas ne sont pas disponibles pour l&#x27;instant.");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("<figure");
  });

  // Dit que l'historique du canvas n'est pas là quand le gateway est d'avant, et attend la première frame sans rien inventer
  it("says the history of the canvas is not there when the gateway is from before, and waits for the first frame without making anything up", () => {
    const before = render(ready("day", undefined));
    const waiting = render({ activity: null, period: "day", history: { status: "loading" } });

    expect(before).toContain("L&#x27;historique de ce canvas n&#x27;est pas disponible.");
    expect(before).not.toContain("<figure");
    expect(waiting).toContain("Chargement…");
    expect(waiting).not.toContain("Personnes connectées");
    expect(waiting).not.toContain("<table");
  });
});
