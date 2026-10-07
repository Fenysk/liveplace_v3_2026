import { describe, expect, it } from "vitest";
import {
  BROADCAST_DELAY_CEILING_MS,
  CANVAS_CONNECTIONS_CEILING,
  CAPACITY_LINKS,
  CAPACITY_RESOURCE_IDS,
  CAPACITY_SAMPLE_MS,
  type CapacityResource,
  type CapacityResourceId,
  CONVEX_CEILINGS,
  CONVEX_PLAN,
  CONVEX_USAGE_MS,
  GATEWAY_OUTBOUND_CEILING_BPS,
  getCapacitySpec,
  INSTANT_WINDOW_MS,
  isWithoutNews,
  projectMonth,
  TOTAL_CONNECTIONS_CEILING,
  toInstantResource,
  toMonthlyResource,
  toMonthStart,
  toPeak,
  toRatio,
  toSaturation,
  toSaturationColor,
  toThousandth,
} from "./capacity";
import { HOUR_MS, MINUTE_MS } from "./index";

const now = Date.UTC(2026, 9, 7, 12, 0, 0);

const measured = (id: CapacityResourceId, ratio: number): CapacityResource => {
  const { link, unit } = getCapacitySpec(id);
  return { link, id, unit, state: "measured", value: ratio, ceiling: 100, ratio };
};
const withoutNews = (id: CapacityResourceId): CapacityResource => {
  const { link, unit } = getCapacitySpec(id);
  return { link, id, unit, state: "withoutNews" };
};

// Écart §5.1 et §6 (JOURNAL 2026-10-07) : les plafonds fixes de la capacité, dans domain.
describe("the fixed ceilings (JOURNAL 2026-10-07)", () => {
  // Fixe le débit sortant à 200 Mbit/s, le délai de diffusion à 250 ms, et les connexions à 1 000 et 1 750
  it("fixes the outbound rate at 200 Mbit/s, the broadcast delay at 250 ms, and the connections at 1,000 and 1,750", () => {
    expect(GATEWAY_OUTBOUND_CEILING_BPS).toBe(200_000_000);
    expect(BROADCAST_DELAY_CEILING_MS).toBe(250);
    expect(CANVAS_CONNECTIONS_CEILING).toBe(1000);
    expect(TOTAL_CONNECTIONS_CEILING).toBe(1750);
  });

  // Règle le plan Convex à un seul endroit : Free aujourd'hui, et ses plafonds mensuels suivent
  it("sets the Convex plan in one place: Free today, and its monthly ceilings follow", () => {
    expect(CONVEX_PLAN).toBe("free");
    expect(CONVEX_CEILINGS.free).toEqual({
      calls: 1_000_000,
      databaseIoGb: 1,
      egressGb: 1,
      computeGbHours: 20,
      filesGb: 1,
    });
    expect(getCapacitySpec("convexCalls").ceiling).toBe(CONVEX_CEILINGS[CONVEX_PLAN].calls);
    expect(getCapacitySpec("convexCompute").ceiling).toBe(CONVEX_CEILINGS[CONVEX_PLAN].computeGbHours);
  });

  // Compte les processeurs en cœurs : un pour Redis, qui travaille sur un seul fil, et ceux de la machine, lus avec la mesure
  it("counts the processors in cores: one for Redis, which works on a single thread, and the machine's own", () => {
    expect(getCapacitySpec("redisCpu")).toMatchObject({ unit: "cores", ceiling: 1 });
    expect(getCapacitySpec("machineCpu")).toMatchObject({ unit: "cores", ceiling: null });
  });

  // Range chaque ressource sous un des cinq maillons, une seule fois, avec la cadence de sa mesure
  it("files each resource under one of the five links, once, with the cadence of its measure", () => {
    expect(CAPACITY_LINKS).toEqual(["redis", "gateway", "web", "machine", "convex"]);
    expect(new Set(CAPACITY_RESOURCE_IDS).size).toBe(CAPACITY_RESOURCE_IDS.length);
    for (const id of CAPACITY_RESOURCE_IDS) expect(CAPACITY_LINKS).toContain(getCapacitySpec(id).link);
    expect(getCapacitySpec("gatewayDelay").cadenceMs).toBe(CAPACITY_SAMPLE_MS);
    expect(getCapacitySpec("convexCalls").cadenceMs).toBe(CONVEX_USAGE_MS);
    expect(CONVEX_USAGE_MS).toBe(15 * MINUTE_MS);
  });
});

describe("the ratio and the colors (JOURNAL 2026-10-07)", () => {
  // Rapporte la valeur au plafond, en pourcentage, au dixième
  it("puts the value against the ceiling, in percent, to the tenth", () => {
    expect(toRatio(318, 512)).toBe(62.1);
    expect(toRatio(0, 512)).toBe(0);
    expect(toRatio(600, 512)).toBe(117.2);
  });

  // Un plafond nul ne divise pas : le taux vaut zéro
  it("does not divide by a zero ceiling: the ratio is zero", () => {
    expect(toRatio(5, 0)).toBe(0);
  });

  // Colore en vert sous 50 %, en orange de 50 à 80 % exclu, en rouge à partir de 80 %
  it("colors green under 50 %, orange from 50 % up to 80 % excluded, red from 80 %", () => {
    expect(toSaturationColor(0)).toBe("green");
    expect(toSaturationColor(49.9)).toBe("green");
    expect(toSaturationColor(50)).toBe("orange");
    expect(toSaturationColor(79.9)).toBe("orange");
    expect(toSaturationColor(80)).toBe("red");
    expect(toSaturationColor(140)).toBe("red");
  });
});

describe("the value of an instant resource: the peak of the last 5 minutes (JOURNAL 2026-10-07)", () => {
  // Prend le plus haut des échantillons des 5 dernières minutes, et laisse de côté les plus anciens
  it("takes the highest sample of the last 5 minutes, and leaves the older ones out", () => {
    const samples = [
      { at: now - 6 * MINUTE_MS, value: 99 },
      { at: now - 4 * MINUTE_MS, value: 40 },
      { at: now - MINUTE_MS, value: 25 },
      { at: now - 10_000, value: 30 },
    ];

    expect(INSTANT_WINDOW_MS).toBe(5 * MINUTE_MS);
    expect(toPeak(samples, now)).toBe(40);
  });

  // Ne rend rien sans échantillon dans la fenêtre
  it("returns nothing without a sample in the window", () => {
    expect(toPeak([], now)).toBeUndefined();
    expect(toPeak([{ at: now - 5 * MINUTE_MS, value: 40 }], now)).toBeUndefined();
  });

  // Une fenêtre plus courte ne garde que les derniers échantillons
  it("keeps only the latest samples with a shorter window", () => {
    const samples = [
      { at: now - 25_000, value: 90 },
      { at: now - 5000, value: 10 },
    ];

    expect(toPeak(samples, now, CAPACITY_SAMPLE_MS)).toBe(10);
  });

  // Sans nouvelles : une mesure plus vieille que trois fois sa cadence, pas avant
  it("is without news when the measure is older than three times its cadence, not before", () => {
    expect(isWithoutNews(now - 30_000, CAPACITY_SAMPLE_MS, now)).toBe(false);
    expect(isWithoutNews(now - 30_001, CAPACITY_SAMPLE_MS, now)).toBe(true);
    expect(isWithoutNews(now - 45 * MINUTE_MS, CONVEX_USAGE_MS, now)).toBe(false);
    expect(isWithoutNews(now - 45 * MINUTE_MS - 1, CONVEX_USAGE_MS, now)).toBe(true);
  });

  // Mesure la ressource sur son pic, face au plafond de sa spécification ou à celui qu'on lui donne
  it("measures the resource on its peak, against the ceiling of its spec or the one it is given", () => {
    const samples = [
      { at: now - 2 * MINUTE_MS, value: 180 },
      { at: now - 5000, value: 120 },
    ];

    expect(toInstantResource(getCapacitySpec("gatewayDelay"), samples, undefined, now)).toEqual({
      link: "gateway",
      id: "gatewayDelay",
      unit: "milliseconds",
      state: "measured",
      value: 120, // un p99 sur 5 minutes déjà : la fenêtre ne garde que le dernier échantillon
      ceiling: 250,
      ratio: 48,
    });
    expect(toInstantResource(getCapacitySpec("redisMemory"), samples, 512, now)).toMatchObject({
      state: "measured",
      value: 180,
      ceiling: 512,
      ratio: 35.2,
    });
  });

  // Dit sans nouvelles une ressource dont le dernier échantillon est trop vieux, ou qui n'en a aucun
  it("says without news for a resource whose last sample is too old, or that has none", () => {
    const stale = [{ at: now - 31_000, value: 10 }];

    expect(toInstantResource(getCapacitySpec("gatewayUtilization"), stale, undefined, now)).toEqual({
      link: "gateway",
      id: "gatewayUtilization",
      unit: "percent",
      state: "withoutNews",
    });
    expect(toInstantResource(getCapacitySpec("gatewayUtilization"), [], undefined, now).state).toBe(
      "withoutNews",
    );
  });

  // Sans plafond lu sur la machine, une ressource à plafond mesuré n'a pas de taux : sans nouvelles
  it("says without news for a resource with a measured ceiling that has none", () => {
    const samples = [{ at: now - 1000, value: 10 }];

    expect(toInstantResource(getCapacitySpec("machineDisk"), samples, undefined, now).state).toBe(
      "withoutNews",
    );
    expect(toInstantResource(getCapacitySpec("machineDisk"), samples, 0, now).state).toBe("withoutNews");
  });
});

describe("the value of a monthly ceiling: the projection at the end of the month (JOURNAL 2026-10-07)", () => {
  // Commence le mois UTC à minuit UTC du 1er
  it("starts the UTC month at midnight UTC on the 1st", () => {
    expect(toMonthStart(Date.UTC(2026, 9, 31, 23, 59))).toBe(Date.UTC(2026, 9, 1));
    expect(toMonthStart(Date.UTC(2026, 10, 1))).toBe(Date.UTC(2026, 10, 1));
  });

  // Projette au rythme moyen du mois : 10 jours écoulés sur 31, l'usage est multiplié par 3,1
  it("projects at the average pace of the month: 10 days gone out of 31 multiply the usage by 3.1", () => {
    const at = Date.UTC(2026, 9, 11); // 10 jours après le 1er

    const { projected } = projectMonth(200_000, 1_000_000, at);

    expect(projected).toBeCloseTo(620_000, 3);
  });

  // Compte au moins un jour : à la première heure du mois, le rythme n'est pas extrapolé à partir de minutes
  it("counts at least one day: in the first hour of the month the pace is not extrapolated from minutes", () => {
    const at = Date.UTC(2026, 9, 1, 1);

    const { projected } = projectMonth(1000, 1_000_000, at);

    expect(projected).toBeCloseTo(31_000, 3);
  });

  // Dit le jour où il serait plein quand son rythme l'y mène avant la fin du mois, et rien sinon
  it("says the day it would be full when its pace leads there before the end of the month, and nothing else", () => {
    const at = Date.UTC(2026, 9, 11); // 10 jours, 500 000 appels : 50 000 par jour, plein à 20 jours

    expect(projectMonth(500_000, 1_000_000, at).fullAt).toBe(Date.UTC(2026, 9, 21));
    expect(projectMonth(200_000, 1_000_000, at).fullAt).toBeUndefined();
    expect(projectMonth(0, 1_000_000, at).fullAt).toBeUndefined();
  });

  // Mesure le quota sur sa projection, et dit son jour plein
  it("measures the monthly ceiling on its projection, and says its full day", () => {
    const spec = getCapacitySpec("convexCalls");
    const at = Date.UTC(2026, 9, 11);

    expect(toMonthlyResource(spec, { used: 500_000, at }, at)).toEqual({
      link: "convex",
      id: "convexCalls",
      unit: "calls",
      state: "measured",
      value: 1_550_000,
      ceiling: 1_000_000,
      ratio: 155,
      fullAt: Date.UTC(2026, 9, 21),
    });
    expect(toMonthlyResource(spec, { used: 100_000, at }, at)).not.toHaveProperty("fullAt");
  });

  // Arrondit la projection au millième : aucun bruit de virgule flottante sur le fil
  it("rounds the projection to the thousandth: no floating-point noise on the wire", () => {
    const spec = getCapacitySpec("convexEgress");
    const at = Date.UTC(2026, 9, 7, 12); // 6,5 jours : 0,15 Go × 31 / 6,5 = 0,715384…

    expect(toMonthlyResource(spec, { used: 0.15, at }, at)).toMatchObject({ value: 0.715, ratio: 71.5 });
    expect(toThousandth(2.0004)).toBe(2);
    expect(toThousandth(2.0006)).toBe(2.001);
  });

  // Dit sans nouvelles une mesure Convex de plus de 45 minutes, ou absente
  it("says without news for a Convex measure older than 45 minutes, or missing", () => {
    const spec = getCapacitySpec("convexEgress");
    const read = Date.UTC(2026, 9, 11);

    expect(toMonthlyResource(spec, { used: 0.1, at: read }, read + 45 * MINUTE_MS).state).toBe("measured");
    expect(toMonthlyResource(spec, { used: 0.1, at: read }, read + 45 * MINUTE_MS + 1).state).toBe(
      "withoutNews",
    );
    expect(toMonthlyResource(spec, undefined, read).state).toBe("withoutNews");
  });
});

describe("the saturation: the highest ratio and the resource that carries it (JOURNAL 2026-10-07)", () => {
  // Vaut le plus haut des taux, et nomme la ressource qui le porte
  it("is the highest ratio, and names the resource that carries it", () => {
    const saturation = toSaturation(
      [measured("redisMemory", 62), measured("redisCpu", 10), measured("machineDisk", 30)],
      new Map(),
      now,
    );

    expect(saturation).toEqual({
      percent: 62,
      resource: "redisMemory",
      isIncomplete: false,
      linkRatios: { redis: 62, machine: 30 },
    });
  });

  // Reste incomplète dès qu'une ressource est sans nouvelles, et garde le plus haut taux des autres
  it("is incomplete as soon as a resource is without news, and keeps the highest ratio of the others", () => {
    const saturation = toSaturation(
      [measured("redisMemory", 20), withoutNews("webUtilization")],
      new Map(),
      now,
    );

    expect(saturation).toMatchObject({ percent: 20, resource: "redisMemory", isIncomplete: true });
  });

  // Une ressource non mesurée n'est ni un taux ni un manque : la saturation n'est pas incomplète
  it("neither counts nor misses a resource that is not measured: the saturation is not incomplete", () => {
    const { link, unit } = getCapacitySpec("convexCalls");
    const unmeasured: CapacityResource = { link, id: "convexCalls", unit, state: "unmeasured" };

    const saturation = toSaturation([measured("redisMemory", 20), unmeasured], new Map(), now);

    expect(saturation).toMatchObject({ percent: 20, isIncomplete: false });
  });

  // Ne vaut rien, sans ressource, mais n'invente aucune ressource porteuse
  it("is zero without any resource, and makes up no carrying resource", () => {
    const saturation = toSaturation([], new Map(), now);

    expect(saturation).toEqual({ percent: 0, isIncomplete: false, linkRatios: {} });
  });

  // Vaut 100 % pendant l'heure qui suit un plafond atteint, puis retombe au taux mesuré
  it("is 100 % during the hour that follows a ceiling reached, then falls back to the measured ratio", () => {
    const resources = [measured("redisMemory", 40), measured("redisCpu", 10)];
    const reached = new Map<CapacityResourceId, number>([["redisMemory", now - HOUR_MS + 1]]);

    expect(toSaturation(resources, reached, now)).toMatchObject({
      percent: 100,
      resource: "redisMemory",
      linkRatios: { redis: 100 },
    });
    expect(toSaturation(resources, reached, now + 1)).toMatchObject({ percent: 40 });
  });

  // Un plafond atteint pèse 100 % même quand sa ressource est sans nouvelles, et n'abaisse jamais un taux plus haut
  it("weighs a ceiling reached at 100 % even when its resource is without news, and never lowers a higher ratio", () => {
    const reached = new Map<CapacityResourceId, number>([["convexCalls", now - 1000]]);

    expect(toSaturation([withoutNews("convexCalls")], reached, now)).toMatchObject({
      percent: 100,
      resource: "convexCalls",
      isIncomplete: true,
    });
    expect(toSaturation([measured("convexCalls", 140)], reached, now)).toMatchObject({
      percent: 140,
      resource: "convexCalls",
    });
  });
});
