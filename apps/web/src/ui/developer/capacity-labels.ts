// Les mots de la section Capacité de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-07) : chaque valeur dans son unité,
// des nombres au format français, des textes courts. Le gateway dit les nombres ; ici, ce que le développeur lit.

import {
  CAPACITY_LINKS,
  type CapacityLink,
  type CapacityResourceId,
  CONVEX_PLAN,
  getCapacitySpec,
  toSaturationColor,
} from "@liveplace/domain/capacity";
import type { CapacityFrame } from "@liveplace/domain/ports";
import type { CapacityRowState } from "../design/capacity-row";
import type { CapacityTone } from "../design/capacity-tone";
import { formatCount } from "./activity-labels";

type FrameResource = CapacityFrame["resources"][number];
type MeasuredResource = Extract<FrameResource, { state: "measured" }>;

// Une espace insécable avant l'unité et le pourcentage : le nombre et son unité ne se coupent jamais à la ligne.
const NBSP = String.fromCharCode(0xa0);

export const LINK_LABELS: Record<CapacityLink, string> = {
  redis: "Redis",
  gateway: "Gateway",
  web: "Web",
  machine: "VPS",
  convex: "Convex",
};

// `name` : le titre de la ligne ; `inline` : le même au fil d'une phrase (« Redis, mémoire »).
const RESOURCE_NAMES: Record<CapacityResourceId, { name: string; inline: string }> = {
  redisMemory: { name: "Mémoire", inline: "mémoire" },
  redisCpu: { name: "Processeur", inline: "processeur" },
  gatewayUtilization: { name: "Occupation", inline: "occupation" },
  gatewayDelay: { name: "Délai de diffusion", inline: "délai de diffusion" },
  gatewayOutbound: { name: "Débit sortant", inline: "débit sortant" },
  gatewayCanvasConnections: {
    name: "Connexions au plus gros canvas",
    inline: "connexions au plus gros canvas",
  },
  gatewayConnections: { name: "Connexions en tout", inline: "connexions en tout" },
  webUtilization: { name: "Occupation", inline: "occupation" },
  machineMemory: { name: "Mémoire", inline: "mémoire" },
  machineCpu: { name: "Processeur", inline: "processeur" },
  machineDisk: { name: "Disque", inline: "disque" },
  convexCalls: { name: "Appels de fonctions", inline: "appels de fonctions" },
  convexDatabaseIo: { name: "E/S de la base", inline: "E/S de la base" },
  convexEgress: { name: "Données sortantes", inline: "données sortantes" },
  convexCompute: { name: "Calcul des actions", inline: "calcul des actions" },
};

// « Redis, mémoire » : le maillon et la ressource, comme la saturation les nomme.
const toInlineName = (id: CapacityResourceId): string =>
  `${LINK_LABELS[getCapacitySpec(id).link]}, ${RESOURCE_NAMES[id].inline}`;

// Trois chiffres significatifs : « 8,35 », « 318 », « 1,59 ».
const formatSignificant = (value: number): string =>
  value.toLocaleString("fr-FR", { maximumSignificantDigits: 3 });

const withUnit = (text: string, unit: string): string => `${text}${NBSP}${unit}`;

// Du bit à l'octet, 1 024 d'un cran à l'autre : « 512 Mo » est la mémoire que Redis s'est donnée (`512mb`).
const BYTE_UNITS = ["o", "Ko", "Mo", "Go", "To"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < BYTE_UNITS.length - 1) {
    value /= 1024;
    index += 1;
  }
  return withUnit(formatSignificant(value), BYTE_UNITS[index] ?? "o");
}

// Un débit se dit en base 1 000, comme un port réseau.
const BIT_RATE_UNITS = ["bit/s", "kbit/s", "Mbit/s", "Gbit/s"] as const;

export function formatBitRate(bitsPerSecond: number): string {
  let value = bitsPerSecond;
  let index = 0;
  while (value >= 1000 && index < BIT_RATE_UNITS.length - 1) {
    value /= 1000;
    index += 1;
  }
  return withUnit(formatSignificant(value), BIT_RATE_UNITS[index] ?? "bit/s");
}

export const formatMilliseconds = (milliseconds: number): string =>
  withUnit(formatCount(Math.round(milliseconds)), "ms");

// Au dixième sous 10 %, entier au-dessus, et jamais arrondi vers le haut : 49,9 % se lit « 49 % » et reste vert, comme
// 79,9 % reste orange. L'affichage et la teinte s'accordent toujours.
export function formatRate(ratio: number): string {
  const shown =
    ratio < 10 ? (Math.floor(ratio * 10) / 10).toLocaleString("fr-FR") : formatCount(Math.floor(ratio));
  return withUnit(shown, "%");
}

// Le plafond d'un quota de millions d'appels se dit court : « 1 M ».
const formatCompact = (count: number): string =>
  new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(count);

const toCoresText = (ratio: number, cores: number): string =>
  `${formatRate(ratio)} ${cores === 1 ? "d'un cœur" : `de ${formatCount(cores)} cœurs`}`;

// La valeur d'une ressource mesurée face à son plafond, dans son unité : « 318 Mo sur 512 Mo ».
export function toResourceText({ unit, value, ceiling, ratio }: MeasuredResource): string {
  const against = (format: (amount: number) => string): string => `${format(value)} sur ${format(ceiling)}`;
  if (unit === "bytes") return against(formatBytes);
  if (unit === "milliseconds") return against(formatMilliseconds);
  if (unit === "bitsPerSecond") return against(formatBitRate);
  if (unit === "connections") return against(formatCount);
  if (unit === "calls") return `${formatCount(Math.round(value))} sur ${formatCompact(ceiling)}`;
  if (unit === "gigabytes") return against((amount) => withUnit(formatSignificant(amount), "Go"));
  if (unit === "gigabyteHours") return against((amount) => withUnit(formatSignificant(amount), "Go-heures"));
  if (unit === "cores") return toCoresText(ratio, ceiling);
  return formatRate(value);
}

// La teinte d'un taux : celle de la saturation, vert sous 50 %, orange de 50 à 80 %, rouge ensuite.
const TONES = { green: "ok", orange: "warning", red: "danger" } as const;

const toTone = (ratio: number): Exclude<CapacityTone, "neutral"> => TONES[toSaturationColor(ratio)];

export function toRowState(resource: FrameResource): CapacityRowState {
  if (resource.state !== "measured") return { kind: resource.state };
  return {
    kind: "measured",
    value: toResourceText(resource),
    percent: resource.ratio,
    rate: formatRate(resource.ratio),
    tone: toTone(resource.ratio),
  };
}

// Le mois où le quota se projette, en toutes lettres : le mois UTC, celui de Convex.
const toMonthName = (nowMs: number): string =>
  new Date(nowMs).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });

const toDayOfMonth = (at: number): string =>
  new Date(at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

// Une légende discrète sous le nom : un quota mensuel dit sa projection, et son jour plein ; le délai, ses poses.
export function toRowNote(resource: FrameResource, nowMs: number): string | undefined {
  if (resource.id === "gatewayDelay") return "pour 99 % des poses";
  if (resource.link !== "convex" || resource.state !== "measured") return undefined;
  const projection = `projection fin ${toMonthName(nowMs)}`;
  return resource.fullAt === undefined
    ? projection
    : `${projection} · plein le ${toDayOfMonth(resource.fullAt)}`;
}

export type CapacityRowView = {
  id: CapacityResourceId;
  name: string;
  note: string | undefined;
  state: CapacityRowState;
};

export type CapacityLinkView = {
  link: CapacityLink;
  title: string;
  detail?: string; // Convex : ses déploiements et son plan
  rows: CapacityRowView[];
};

const toPlanName = (): string => `plan ${CONVEX_PLAN.charAt(0).toUpperCase()}${CONVEX_PLAN.slice(1)}`;

// Les déploiements que compte Convex, par ordre alphabétique, puis son plan.
const toConvexDetail = (resources: readonly FrameResource[]): string => {
  const deployments = [...new Set(resources.flatMap(({ deployments = [] }) => deployments))].sort();
  return [...(deployments.length > 0 ? [deployments.join(", ")] : []), toPlanName()].join(" · ");
};

// Un groupe par maillon qui a des ressources, dans l'ordre de la chaîne.
export function toCapacityLinks(resources: readonly FrameResource[], nowMs: number): CapacityLinkView[] {
  return CAPACITY_LINKS.flatMap((link) => {
    const own = resources.filter((resource) => resource.link === link);
    if (own.length === 0) return [];
    const rows = own.map((resource) => ({
      id: resource.id,
      name: RESOURCE_NAMES[resource.id].name,
      note: toRowNote(resource, nowMs),
      state: toRowState(resource),
    }));
    return [
      { link, title: LINK_LABELS[link], ...(link === "convex" ? { detail: toConvexDetail(own) } : {}), rows },
    ];
  });
}

export type SaturationView = {
  percent: string;
  tone: CapacityTone;
  caption: string; // « Redis, mémoire · à surveiller »
  note?: string; // « Incomplète : … sans nouvelles »
};

const LEVELS = { green: "large", orange: "à surveiller", red: "proche" } as const;

// Jusqu'à deux ressources sans nouvelles par leur nom, puis le nombre des autres.
const toMissingNote = (resources: readonly FrameResource[]): string => {
  const missing = resources.filter(({ state }) => state === "withoutNews").map(({ id }) => toInlineName(id));
  const [first, second, ...others] = missing;
  const named = [first, second].filter((name) => name !== undefined).join(" ; ");
  const rest = others.length > 0 ? ` et ${formatCount(others.length)} autres` : "";
  return `Incomplète : ${named}${rest} sans nouvelles`;
};

// Incomplète, elle n'est jamais verte : neutre, et sans « large », qu'une ressource sans nouvelles pourrait démentir.
export function toSaturationView(
  { percent, resource, isIncomplete }: CapacityFrame["saturation"],
  resources: readonly FrameResource[],
): SaturationView {
  const color = toSaturationColor(percent);
  const isNeutral = resource === undefined || (isIncomplete && color === "green");
  const carrier = resource === undefined ? "aucune mesure" : toInlineName(resource);
  return {
    percent: formatRate(percent),
    tone: isNeutral ? "neutral" : TONES[color],
    caption: isNeutral ? carrier : `${carrier} · ${LEVELS[color]}`,
    ...(isIncomplete ? { note: toMissingNote(resources) } : {}),
  };
}
