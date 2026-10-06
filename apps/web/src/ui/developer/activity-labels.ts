// Les mots de la section Activité (écart §4.3, JOURNAL 2026-10-06) : des nombres au format français, des textes courts.

import { type ActivityPeriod, MINUTE_MS, type Role, type Timestamp } from "@liveplace/domain";
import type { ActivityCanvas } from "@liveplace/domain/ports";
import type { CanvasActivityCardProps } from "../design/canvas-activity-card";
import type { SegmentedOption } from "../design/segmented";

export const formatCount = (count: number): string => count.toLocaleString("fr-FR");

// En français, zéro et un s'accordent au singulier.
const counted = (count: number, one: string, many: string): string =>
  `${formatCount(count)} ${count <= 1 ? one : many}`;

export const guestsNote = (guests: number): string =>
  guests === 0 ? "aucun invité" : `dont ${counted(guests, "invité", "invités")}`;

export const peopleLabel = (people: number, guests: number): string =>
  guests === 0
    ? counted(people, "personne", "personnes")
    : `${counted(people, "personne", "personnes")}, ${guestsNote(guests)}`;

export const heatLabel = (heat: number): string => `${formatCount(heat)} px/h`;

export const signupsLabel = (signups: number): string =>
  counted(signups, "nouveau compte", "nouveaux comptes");

// Ce que l'infobulle des courbes dit de chaque valeur, accordée comme les lignes des canvas.
export const connectedPeopleLabel = (people: number): string =>
  counted(people, "personne connectée", "personnes connectées");

export const streamedCanvasesLabel = (streamed: number): string =>
  counted(streamed, "canvas streamé", "canvas streamés");

export const placedPixelsLabel = (pixels: number): string => counted(pixels, "pixel posé", "pixels posés");

const ROLE_LABELS: Record<Role, string> = {
  owner: "Streamer",
  moderator: "Modérateur",
  viewer: "Viewer",
  guest: "Invité",
};

export const roleLabel = (role: Role): string => ROLE_LABELS[role];

// Une horloge en avance sur celle du serveur dit « moins d'une minute », jamais une durée négative.
export function connectedSince(connectedAt: Timestamp, nowMs: Timestamp): string {
  const minutes = Math.max(0, Math.floor((nowMs - connectedAt) / MINUTE_MS));
  if (minutes < 1) return "depuis moins d'une minute";
  if (minutes < 60) return `depuis ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `depuis ${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `depuis ${counted(Math.floor(hours / 24), "jour", "jours")}`;
}

export const PERIOD_OPTIONS = [
  { value: "day", label: "24 h" },
  { value: "month", label: "30 jours" },
  { value: "all", label: "Tout" },
] as const satisfies readonly SegmentedOption<ActivityPeriod>[];

// L'heure de Paris, celle du jour de l'activité ; Tout n'a qu'un point par jour.
const MOMENT_TITLE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_TITLE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const slotTitle = (at: Timestamp, period: ActivityPeriod): string =>
  (period === "all" ? DAY_TITLE : MOMENT_TITLE).format(at);

export function toCanvasActivityCard(
  canvas: ActivityCanvas,
  nowMs: Timestamp,
): Omit<CanvasActivityCardProps, "isOpen" | "onToggle"> {
  const { owner, obsViews, people, guests, heat, signups, accounts } = canvas;
  return {
    owner,
    obsTitle: obsViews === 0 ? null : counted(obsViews, "vue OBS ouverte", "vues OBS ouvertes"),
    facts: [peopleLabel(people, guests), heatLabel(heat), signupsLabel(signups)],
    accounts: accounts.map((account) => ({
      user: account,
      mention: `${roleLabel(account.role)} · ${connectedSince(account.connectedAt, nowMs)}`,
      devices: account.devices,
    })),
    guestsLine: guests === 0 ? null : `+ ${counted(guests, "invité", "invités")}`,
  };
}
