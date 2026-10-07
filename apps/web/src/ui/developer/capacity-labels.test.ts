import type { CapacityFrame } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import {
  formatBitRate,
  formatBytes,
  formatMilliseconds,
  formatRate,
  toCapacityLinks,
  toResourceText,
  toRowState,
  toSaturationView,
} from "./capacity-labels";

type Resource = CapacityFrame["resources"][number];
type Saturation = CapacityFrame["saturation"];
type Measured = Extract<Resource, { state: "measured" }>;

const nowMs = Date.UTC(2026, 9, 7, 12); // le 7 octobre 2026

const measured = (
  id: Resource["id"],
  unit: Resource["unit"],
  value: number,
  ceiling: number,
  ratio: number,
  more: { fullAt?: number; deployments?: string[] } = {},
): Measured => ({
  link: id.startsWith("redis")
    ? "redis"
    : id.startsWith("gateway")
      ? "gateway"
      : id.startsWith("web")
        ? "web"
        : id.startsWith("machine")
          ? "machine"
          : "convex",
  id,
  unit,
  state: "measured",
  value,
  ceiling,
  ratio,
  ...more,
});

const without = (
  id: Resource["id"],
  state: "withoutNews" | "unmeasured",
  link: Resource["link"],
): Resource => ({
  link,
  id,
  unit: "percent",
  state,
});

describe("the numbers of the capacity section, in French (JOURNAL 2026-10-07)", () => {
  // Dit les octets en Mo, Go, To, avec trois chiffres significatifs, une virgule et une espace insécable avant l'unité
  it("says bytes in Mo, Go and To, with three significant digits, a comma and a no-break space before the unit", () => {
    expect(formatBytes(536_870_912)).toBe("512\u00a0Mo");
    expect(formatBytes(8_758_560)).toBe("8,35\u00a0Mo");
    expect(formatBytes(1_743_074_131_968)).toBe("1,59\u00a0To");
    expect(formatBytes(27_993_546_752)).toBe("26,1\u00a0Go");
    expect(formatBytes(0)).toBe("0\u00a0o");
    expect(formatBytes(900)).toBe("900\u00a0o");
    expect(formatBytes(2048)).toBe("2\u00a0Ko");
  });

  // Dit un débit en bit/s, kbit/s, Mbit/s, en base 1 000
  it("says a rate in bit/s, kbit/s and Mbit/s, in base 1,000", () => {
    expect(formatBitRate(0)).toBe("0\u00a0bit/s");
    expect(formatBitRate(8365)).toBe("8,37\u00a0kbit/s");
    expect(formatBitRate(200_000_000)).toBe("200\u00a0Mbit/s");
    expect(formatBitRate(1_250_000_000)).toBe("1,25\u00a0Gbit/s");
  });

  // Dit un délai en millisecondes entières
  it("says a delay in whole milliseconds", () => {
    expect(formatMilliseconds(139.6)).toBe("140\u00a0ms");
    expect(formatMilliseconds(0)).toBe("0\u00a0ms");
  });

  // Dit un taux au dixième sous 10 %, entier au-dessus, jamais arrondi vers le haut : l'affichage et la couleur s'accordent
  it("says a ratio to the tenth under 10 %, whole above, never rounded up: the display and the color agree", () => {
    expect(formatRate(0.4)).toBe("0,4\u00a0%");
    expect(formatRate(9.9)).toBe("9,9\u00a0%");
    expect(formatRate(62.1)).toBe("62\u00a0%");
    expect(formatRate(49.9)).toBe("49\u00a0%");
    expect(formatRate(215.9)).toBe("215\u00a0%");
  });
});

describe("the value of a resource, in its unit (JOURNAL 2026-10-07)", () => {
  // Dit chaque valeur face à son plafond, dans l'unité de la ressource
  it("says each value against its ceiling, in the unit of the resource", () => {
    const texts = [
      measured("redisMemory", "bytes", 333_447_168, 536_870_912, 62.1),
      measured("gatewayDelay", "milliseconds", 40, 100, 40),
      measured("gatewayConnections", "connections", 410, 1750, 23.4),
      measured("gatewayOutbound", "bitsPerSecond", 9_000_000, 200_000_000, 4.5),
      measured("gatewayUtilization", "percent", 40, 100, 40),
      measured("redisCpu", "cores", 0.09, 1, 9),
      measured("machineCpu", "cores", 0.36, 4, 9),
      measured("convexCalls", "calls", 55_000, 1_000_000, 5.5),
      measured("convexDatabaseIo", "gigabytes", 0.35, 1, 35),
      measured("convexCompute", "gigabyteHours", 17.8, 20, 89),
    ].map(toResourceText);

    expect(texts).toEqual([
      "318\u00a0Mo sur 512\u00a0Mo",
      "40\u00a0ms sur 100\u00a0ms",
      "410 sur 1\u202f750",
      "9\u00a0Mbit/s sur 200\u00a0Mbit/s",
      "40\u00a0%",
      "9\u00a0% d'un cœur",
      "9\u00a0% de 4 cœurs",
      "55\u202f000 sur 1\u00a0M",
      "0,35\u00a0Go sur 1\u00a0Go",
      "17,8\u00a0Go-heures sur 20\u00a0Go-heures",
    ]);
  });

  // Dit « sans nouvelles » ou « non mesuré » à la place de la valeur, sans barre ni taux
  it("says without news or not measured in place of the value, with no bar and no ratio", () => {
    expect(toRowState(without("webUtilization", "withoutNews", "web"))).toEqual({ kind: "withoutNews" });
    expect(toRowState(without("convexCalls", "unmeasured", "convex"))).toEqual({ kind: "unmeasured" });
  });

  // Une ligne mesurée porte son taux, sa barre et sa teinte : verte sous 50 %, orange de 50 à 80 %, rouge ensuite
  it("gives a measured row its ratio, its bar and its tone: green under 50 %, orange from 50 to 80 %, red after", () => {
    const row = (ratio: number) => toRowState(measured("redisMemory", "bytes", 1, 2, ratio));

    expect(row(49.9)).toMatchObject({ kind: "measured", percent: 49.9, rate: "49\u00a0%", tone: "ok" });
    expect(row(50)).toMatchObject({ tone: "warning" });
    expect(row(79.9)).toMatchObject({ tone: "warning" });
    expect(row(80)).toMatchObject({ tone: "danger" });
    expect(row(215.9)).toMatchObject({ percent: 215.9, rate: "215\u00a0%", tone: "danger" });
  });
});

describe("the saturation at the head of the section (JOURNAL 2026-10-07)", () => {
  const saturation = (percent: number, isIncomplete = false): Saturation => ({
    percent,
    resource: "redisMemory",
    isIncomplete,
  });

  // Dit le pourcentage, la ressource qui le porte, et s'il est large, à surveiller ou proche
  it("says the percentage, the resource that carries it, and whether it is wide, to watch or close", () => {
    expect(toSaturationView(saturation(12.3), [])).toEqual({
      percent: "12\u00a0%",
      tone: "ok",
      caption: "Redis, mémoire · large",
    });
    expect(toSaturationView(saturation(62.1), [])).toMatchObject({
      percent: "62\u00a0%",
      tone: "warning",
      caption: "Redis, mémoire · à surveiller",
    });
    expect(toSaturationView(saturation(87.2), [])).toMatchObject({
      tone: "danger",
      caption: "Redis, mémoire · proche",
    });
  });

  // Dit la ressource d'un maillon par son nom court : « VPS, disque », « Gateway, connexions au plus gros canvas »
  it("names the resource of a link by its short name", () => {
    const disk: Saturation = { percent: 20, resource: "machineDisk", isIncomplete: false };
    const canvas: Saturation = { percent: 20, resource: "gatewayCanvasConnections", isIncomplete: false };

    expect(toSaturationView(disk, []).caption).toBe("VPS, disque · large");
    expect(toSaturationView(canvas, []).caption).toBe("Gateway, connexions au plus gros canvas · large");
  });

  // Incomplète : jamais verte, elle le dit et nomme ce qui est sans nouvelles ; orange ou rouge, elle garde sa teinte
  it("is never green when incomplete, says it and names what is without news; orange or red, it keeps its tone", () => {
    const missing = [without("webUtilization", "withoutNews", "web")];

    expect(toSaturationView(saturation(12, true), missing)).toEqual({
      percent: "12\u00a0%",
      tone: "neutral",
      caption: "Redis, mémoire",
      note: "Incomplète : Web, occupation sans nouvelles",
    });
    expect(toSaturationView(saturation(62, true), missing)).toMatchObject({
      tone: "warning",
      caption: "Redis, mémoire · à surveiller",
    });
    expect(toSaturationView(saturation(90, true), missing)).toMatchObject({ tone: "danger" });
  });

  // Nomme jusqu'à deux ressources sans nouvelles, puis compte les autres
  it("names up to two resources without news, then counts the others", () => {
    const missing = [
      without("webUtilization", "withoutNews", "web"),
      without("convexCalls", "withoutNews", "convex"),
      without("convexEgress", "withoutNews", "convex"),
      without("convexCompute", "withoutNews", "convex"),
    ];

    expect(toSaturationView(saturation(12, true), missing).note).toBe(
      "Incomplète : Web, occupation ; Convex, appels de fonctions et 2 autres sans nouvelles",
    );
    expect(toSaturationView(saturation(12, true), missing.slice(0, 2)).note).toBe(
      "Incomplète : Web, occupation ; Convex, appels de fonctions sans nouvelles",
    );
  });

  // Ne dit aucune ressource quand rien n'est mesuré
  it("names no resource when nothing is measured", () => {
    expect(toSaturationView({ percent: 0, isIncomplete: true }, [])).toMatchObject({
      percent: "0\u00a0%",
      tone: "neutral",
      caption: "aucune mesure",
    });
  });
});

describe("the groups of resources, by link (JOURNAL 2026-10-07)", () => {
  const resources: Resource[] = [
    measured("redisMemory", "bytes", 333_447_168, 536_870_912, 62.1),
    measured("gatewayDelay", "milliseconds", 40, 100, 40),
    without("webUtilization", "withoutNews", "web"),
    measured("machineDisk", "bytes", 1_743_074_131_968, 1_999_540_056_064, 87.2),
    measured("convexCalls", "calls", 930_000, 1_000_000, 93, {
      fullAt: Date.UTC(2026, 9, 15, 9),
      deployments: ["watchful-spider-409", "valiant-panther-436"],
    }),
    measured("convexEgress", "gigabytes", 0.4, 1, 40, {
      deployments: ["valiant-panther-436", "watchful-spider-409"],
    }),
  ];

  // Range les ressources par maillon, dans l'ordre de la chaîne, sous le nom du maillon : Redis, Gateway, Web, VPS, Convex
  it("files the resources by link, in the order of the chain, under the name of the link", () => {
    const groups = toCapacityLinks(resources, nowMs);

    expect(groups.map(({ title }) => title)).toEqual(["Redis", "Gateway", "Web", "VPS", "Convex"]);
    expect(groups.map(({ rows }) => rows.map(({ name }) => name))).toEqual([
      ["Mémoire"],
      ["Retard de diffusion"],
      ["Occupation"],
      ["Disque"],
      ["Appels de fonctions", "Données sortantes"],
    ]);
  });

  // Le groupe Convex nomme les déploiements comptés, dans l'ordre alphabétique, et le plan
  it("names in the Convex group the deployments counted, in alphabetical order, and the plan", () => {
    const convex = toCapacityLinks(resources, nowMs).at(-1);

    expect(convex?.detail).toBe("valiant-panther-436, watchful-spider-409 · plan Free");
  });

  // Sans déploiement, le groupe Convex ne nomme que le plan
  it("names only the plan in the Convex group without a deployment", () => {
    const convex = toCapacityLinks([without("convexCalls", "unmeasured", "convex")], nowMs).at(-1);

    expect(convex?.detail).toBe("plan Free");
  });

  // Dit sous un quota mensuel sa projection à la fin du mois, et le jour où il serait plein
  it("says under a monthly ceiling its projection at the end of the month, and the day it would be full", () => {
    const [calls, egress] = toCapacityLinks(resources, nowMs).at(-1)?.rows ?? [];

    expect(calls?.note).toBe("projection fin octobre · plein le 15/10");
    expect(egress?.note).toBe("projection fin octobre");
  });

  // Le retard de diffusion dit au-delà de quoi il compte, et pour combien de poses
  it("tells the broadcast lateness beyond what it counts, and for how many poses", () => {
    const [delay] = toCapacityLinks(resources, nowMs)[1]?.rows ?? [];

    expect(delay?.note).toBe("au-delà du tick, pour 99 % des poses");
  });

  // Laisse sans légende une ressource sans nouvelles, et ne montre aucun groupe sans ressource
  it("leaves a resource without news with no caption, and shows no group without a resource", () => {
    const groups = toCapacityLinks([without("webUtilization", "withoutNews", "web")], nowMs);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows[0]).toEqual({
      id: "webUtilization",
      name: "Occupation",
      note: undefined,
      state: { kind: "withoutNews" },
    });
  });
});
