// Les chiffres d'exemple de la capacité (cahier des charges de la capacité ; JOURNAL 2026-10-07) : une frame dans chacun de
// ses états, et des courbes. Aucune connexion : /design montre l'affichage, jamais le gateway. La saturation est celle que
// calcule `domain`, pas une valeur écrite à la main.

import type { ActivityPeriod } from "@liveplace/domain";
import {
  CAPACITY_LINKS,
  type CapacityLink,
  type CapacityResource,
  type CapacityResourceId,
  getCapacitySpec,
  toRatio,
  toSaturation,
} from "@liveplace/domain/capacity";
import type { CapacityFrame, CapacityPoint } from "@liveplace/domain/ports";
import { lastPointAt, PERIOD_SHAPES } from "./activity-samples";

type Resource = CapacityResource; // celle de `domain` : la saturation s'en tire

const OCTOBER_15 = Date.UTC(2026, 9, 15, 9);
const DEPLOYMENTS = ["valiant-panther-436", "watchful-spider-409"];

// Une ressource mesurée : son unité et son maillon viennent de `domain`, son taux aussi.
const measured = (
  id: CapacityResourceId,
  value: number,
  ceiling: number,
  more: { deployments?: string[]; fullAt?: number } = {},
): Resource => {
  const { link, unit } = getCapacitySpec(id);
  return { link, id, unit, state: "measured", value, ceiling, ratio: toRatio(value, ceiling), ...more };
};

const missing = (id: CapacityResourceId, state: "withoutNews" | "unmeasured"): Resource => {
  const { link, unit } = getCapacitySpec(id);
  return { link, id, unit, state };
};

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

// Chaque ressource à sa valeur de l'exemple : la mémoire de Redis à 62 %, le reste loin de son plafond.
const base = (): Resource[] => [
  measured("redisMemory", 318 * MIB, 512 * MIB),
  measured("redisCpu", 0.09, 1),
  measured("gatewayUtilization", 8, 100),
  measured("gatewayDelay", 140, 250),
  measured("gatewayOutbound", 9_000_000, 200_000_000),
  measured("gatewayCanvasConnections", 120, 1000),
  measured("gatewayConnections", 410, 1750),
  measured("webUtilization", 6, 100),
  measured("machineMemory", 1.4 * GIB, 4 * GIB),
  measured("machineCpu", 0.36, 4),
  measured("machineDisk", 24 * GIB, 80 * GIB),
  measured("convexCalls", 55_000, 1_000_000, { deployments: DEPLOYMENTS }),
  measured("convexDatabaseIo", 0.35, 1, { deployments: DEPLOYMENTS }),
  measured("convexEgress", 0.12, 1, { deployments: DEPLOYMENTS }),
  measured("convexCompute", 4.2, 20, { deployments: DEPLOYMENTS }),
];

// Une ressource de l'exemple, remplacée.
const replaced = (resources: readonly Resource[], ...changes: Resource[]): Resource[] =>
  resources.map((resource) => changes.find(({ id }) => id === resource.id) ?? resource);

// La saturation que `domain` tire des ressources, avec la forme de la frame.
const toFrame = (resources: Resource[], nowMs: number): CapacityFrame => {
  const { percent, resource, isIncomplete } = toSaturation(resources, new Map(), nowMs);
  return {
    t: "capacity",
    saturation: { percent, ...(resource === undefined ? {} : { resource }), isIncomplete },
    resources,
  };
};

const CALM = replaced(
  base(),
  measured("redisMemory", 96 * MIB, 512 * MIB),
  measured("gatewayDelay", 40, 250),
  measured("machineDisk", 12 * GIB, 80 * GIB),
);

// Dans chacun de ses états : large, à surveiller, proche ; incomplète ; des ressources sans nouvelles ; Convex non configuré ;
// un quota qui serait plein avant la fin du mois.
export type CapacityVariant =
  | "wide"
  | "watch"
  | "close"
  | "incomplete"
  | "withoutNews"
  | "unconfigured"
  | "quota";

export const sampleCapacityFrame = (variant: CapacityVariant, nowMs: number): CapacityFrame => {
  switch (variant) {
    case "wide":
      return toFrame(CALM, nowMs);
    case "watch":
      return toFrame(base(), nowMs);
    case "close":
      return toFrame(replaced(base(), measured("redisMemory", 446 * MIB, 512 * MIB)), nowMs);
    case "incomplete":
      return toFrame(replaced(CALM, missing("webUtilization", "withoutNews")), nowMs);
    case "withoutNews":
      return toFrame(
        replaced(
          base(),
          missing("redisMemory", "withoutNews"),
          missing("redisCpu", "withoutNews"),
          missing("webUtilization", "withoutNews"),
        ),
        nowMs,
      );
    case "unconfigured":
      return toFrame(
        replaced(
          CALM,
          ...(["convexCalls", "convexDatabaseIo", "convexEgress", "convexCompute"] as const).map((id) =>
            missing(id, "unmeasured"),
          ),
        ),
        nowMs,
      );
    case "quota":
      return toFrame(
        replaced(
          CALM,
          measured("convexCalls", 1_550_000, 1_000_000, { deployments: DEPLOYMENTS, fullAt: OCTOBER_15 }),
        ),
        nowMs,
      );
  }
};

// Le maillon qui porte la saturation d'un point, par sa ressource la plus parlante.
const CARRIERS: Record<CapacityLink, CapacityResourceId> = {
  redis: "redisMemory",
  gateway: "gatewayDelay",
  web: "webUtilization",
  machine: "machineDisk",
  convex: "convexCalls",
};

// Des courbes qui ondulent, un trou (le gateway arrêté) et un maillon, Convex, qui ne mesure qu'à partir d'un moment.
export const sampleCapacityPoints = (period: ActivityPeriod, nowMs: number): CapacityPoint[] => {
  const { count, stepMs, gap } = PERIOD_SHAPES[period];
  const lastAt = lastPointAt(period, nowMs);
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => index < gap[0] || index >= gap[1])
    .map((index) => {
      const ratios: Partial<Record<CapacityLink, number>> = {
        redis: Math.round(48 + 14 * Math.sin(index / 60) + (index % 4)),
        gateway: Math.round(20 + 12 * Math.sin(index / 35) + (index % 5)),
        web: Math.round(8 + 5 * Math.sin(index / 25) + (index % 3)),
        machine: Math.round(36 + 6 * Math.sin(index / 80)),
        ...(index > count / 5 ? { convex: Math.round(18 + 4 * Math.sin(index / 50)) } : {}),
      };
      const carrier = CAPACITY_LINKS.reduce((top, link) =>
        (ratios[link] ?? 0) > (ratios[top] ?? 0) ? link : top,
      );
      return {
        at: lastAt - (count - 1 - index) * stepMs,
        saturation: ratios[carrier] ?? 0,
        resource: CARRIERS[carrier],
        ...ratios,
      };
    });
};
