import { MINUTE_MS, toActivityPointStarts } from "@liveplace/domain";
import type { CapacityFrame } from "@liveplace/domain/ports";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CapacityWatchView } from "../../state/capacity-watch";
import { CapacitySection } from "./capacity-section";

const now = Date.now();
const lastMinute = toActivityPointStarts(now).minute - MINUTE_MS;

const frame: CapacityFrame = {
  t: "capacity",
  saturation: { percent: 62.1, resource: "redisMemory", isIncomplete: false },
  resources: [
    {
      link: "redis",
      id: "redisMemory",
      unit: "bytes",
      state: "measured",
      value: 333_447_168,
      ceiling: 536_870_912,
      ratio: 62.1,
    },
    { link: "gateway", id: "gatewayUtilization", unit: "percent", state: "withoutNews" },
    { link: "web", id: "webUtilization", unit: "percent", state: "unmeasured" },
    {
      link: "convex",
      id: "convexCalls",
      unit: "calls",
      state: "measured",
      value: 930_000,
      ceiling: 1_000_000,
      ratio: 93,
      deployments: ["watchful-spider-409"],
    },
  ],
};

const render = (view: CapacityWatchView): string =>
  renderToStaticMarkup(createElement(CapacitySection, { view, nowMs: now, onSelectPeriod: () => undefined }));

const loading: CapacityWatchView["history"] = { status: "loading" };

describe("the capacity section (écart §4.3, JOURNAL 2026-10-07)", () => {
  // Montre, de haut en bas, la saturation, les ressources par maillon, puis l'historique de la période
  it("shows, top to bottom, the saturation, the resources by link, then the history of the period", () => {
    const markup = render({
      capacity: frame,
      period: "day",
      history: {
        status: "ready",
        points: [{ at: lastMinute, saturation: 62.1, resource: "redisMemory", redis: 62.1 }],
      },
    });

    const order = [
      "Saturation",
      "Redis, mémoire · à surveiller",
      ">Redis<",
      ">Mémoire<",
      ">Gateway<",
      ">Web<",
      ">Convex<",
      "watchful-spider-409 · plan Free",
      ">Historique<",
      "24 h",
      "lp-time-chart-line",
    ];
    const positions = order.map((text) => markup.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  // Montre le pourcentage de la saturation dans sa teinte, et chaque ressource mesurée avec sa barre et son taux
  it("shows the percentage of the saturation in its tone, and each measured resource with its bar and its ratio", () => {
    const markup = render({ capacity: frame, period: "day", history: loading });

    expect(markup).toMatch(/lp-saturation-value lp-type-display lp-warning">62\u00a0%</);
    expect(markup).toContain("318\u00a0Mo sur 512\u00a0Mo");
    expect(markup.match(/<meter /g)).toHaveLength(2);
    expect(markup).toContain("lp-capacity-rate lp-type-title lp-danger");
    expect(markup).toContain("projection fin");
  });

  // Montre la ligne Protections au pied du groupe Gateway, ses deux nombres sur 1 h et 24 h, sans barre ni taux (JOURNAL 2026-10-09)
  it("shows the Protections row at the foot of the Gateway group, its two numbers over 1 h and 24 h, with no bar and no ratio", () => {
    const guards = {
      hour: { refusedPlacements: 20, closedConnections: 1 },
      day: { refusedPlacements: 140, closedConnections: 3 },
    };

    const markup = render({ capacity: { ...frame, guards }, period: "day", history: loading });

    const order = [
      ">Gateway<",
      ">Protections<",
      "poses refusées · connexions fermées",
      ">1 h<",
      "20 · 1",
      ">24 h<",
      "140 · 3",
      ">Web<",
    ];
    const positions = order.map((text) => markup.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(markup.match(/<meter /g)).toHaveLength(2);
    expect(render({ capacity: frame, period: "day", history: loading })).not.toContain("Protections");
  });

  // Dit « sans nouvelles » et « non mesuré » à la place de la valeur, sans barre
  it("says without news and not measured in place of the value, with no bar", () => {
    const markup = render({ capacity: frame, period: "day", history: loading });

    expect(markup).toContain(">sans nouvelles<");
    expect(markup).toContain(">non mesuré<");
  });

  // Une saturation incomplète le dit, et nomme ce qui est sans nouvelles
  it("says an incomplete saturation, and names what is without news", () => {
    const markup = render({
      capacity: { ...frame, saturation: { ...frame.saturation, isIncomplete: true } },
      period: "day",
      history: loading,
    });

    expect(markup).toContain("Incomplète : Gateway, occupation sans nouvelles");
  });

  // Ne rend jamais d'attribut `style` : la CSP de production le bloque dans le HTML du serveur
  it("never renders a `style` attribute: the production CSP blocks it in the server HTML", () => {
    const markup = render({
      capacity: frame,
      period: "day",
      history: {
        status: "ready",
        points: [{ at: lastMinute, saturation: 62.1, resource: "redisMemory", redis: 62.1 }],
      },
    });

    expect(markup).not.toMatch(/\sstyle=/);
  });

  // Attend la première frame sans rien inventer, et garde l'historique et son échec
  it("waits for the first frame without making anything up, and keeps the history and its failure", () => {
    const waiting = render({ capacity: null, period: "all", history: { status: "failed" } });

    expect(waiting).toContain("Chargement…");
    expect(waiting).not.toContain("Saturation");
    expect(waiting).not.toContain("<meter");
    expect(waiting).toContain("L&#x27;historique n&#x27;a pas pu se charger.");
    expect(waiting).toContain(">Historique<");
  });

  // Dit quand l'historique n'a aucun point sur la période
  it("says when the history has no point over the period", () => {
    const markup = render({ capacity: frame, period: "day", history: { status: "ready", points: [] } });

    expect(markup).toContain("Aucun point sur cette période.");
  });
});
