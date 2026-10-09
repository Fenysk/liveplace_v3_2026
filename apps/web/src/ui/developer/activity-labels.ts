// Les mots de la fenêtre Développeur (écart §4.3, JOURNAL 2026-10-06 et 2026-10-07) : des nombres au format français,
// des textes courts.

import { type ActivityPeriod, MINUTE_MS, type Role, type Timestamp } from "@liveplace/domain";
import type {
  ActivityAudience,
  ActivityCanvas,
  CanvasAudience,
  ConnectedAccount,
} from "@liveplace/domain/ports";
import type { CanvasActivityAccount, CanvasActivityCardProps } from "../design/canvas-activity-card";
import type { SegmentedOption } from "../design/segmented";
import type { StatTableCell, StatTableRow } from "../design/stat-table";

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

// Écart §5.1 (JOURNAL 2026-10-08) : les minutes streamées sont celles d'un canvas.
export const streamedMinutesLabel = (minutes: number): string =>
  counted(minutes, "minute streamée", "minutes streamées");

// L'audience (JOURNAL 2026-10-07) : les mêmes accords, pour l'infobulle des courbes.
export const visitsLabel = (visits: number): string => counted(visits, "visite", "visites");

export const visitMinutesLabel = (minutes: number): string => counted(minutes, "minute", "minutes");

export const activeAccountsLabel = (accounts: number): string =>
  counted(accounts, "compte actif", "comptes actifs");

export const activePlayersLabel = (players: number): string =>
  counted(players, "joueur actif", "joueurs actifs");

export const activeStreamersLabel = (streamers: number): string =>
  counted(streamers, "streamer actif", "streamers actifs");

// « 3 h 20 min » : les minutes sur deux chiffres dès qu'il y a des heures.
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${formatCount(minutes)} min`;
  return `${formatCount(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, "0")} min`;
}

// « 4 min 30 s » ; sans visite, la durée moyenne n'existe pas.
export function averageVisit(visitMinutes: number, visits: number): string {
  if (visits === 0) return "—";
  const seconds = Math.round((visitMinutes * 60) / visits);
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
  return formatDuration(Math.round(seconds / 60));
}

export const phoneShareNote = (phoneVisits: number, visits: number): string | undefined =>
  visits === 0 ? undefined : `dont ${Math.round((phoneVisits * 100) / visits)} % au téléphone`;

export const AUDIENCE_COLUMNS = ["Aujourd'hui", "30 jours"] as const;

// Une ligne par chiffre, ses deux cellules dans l'ordre de `AUDIENCE_COLUMNS`.
type AudienceDays<Counts> = { today: Counts; month: Counts };
type VisitCounts = Pick<ActivityAudience["today"], "visits" | "phoneVisits" | "visitMinutes">;

const toCells = <Counts>(
  { today, month }: AudienceDays<Counts>,
  toCell: (counts: Counts) => StatTableCell,
): StatTableCell[] => [toCell(today), toCell(month)];

// Les trois lignes que l'audience de tout LivePlace et celle d'un canvas ont en commun.
const toVisitRows = <Counts extends VisitCounts>(audience: AudienceDays<Counts>): StatTableRow[] => [
  {
    label: "Visites",
    cells: toCells(audience, ({ visits, phoneVisits }) => ({
      value: formatCount(visits),
      note: phoneShareNote(phoneVisits, visits),
    })),
  },
  {
    label: "Temps passé",
    cells: toCells(audience, ({ visitMinutes }) => ({ value: formatDuration(visitMinutes) })),
  },
  {
    label: "Durée moyenne d'une visite",
    cells: toCells(audience, ({ visits, visitMinutes }) => ({ value: averageVisit(visitMinutes, visits) })),
  },
];

export function toAudienceRows(audience: ActivityAudience): StatTableRow[] {
  return [
    ...toVisitRows(audience),
    {
      label: "Comptes actifs",
      cells: toCells(audience, ({ activeAccounts }) => ({ value: formatCount(activeAccounts) })),
    },
    {
      label: "Joueurs actifs",
      cells: toCells(audience, ({ activePlayers }) => ({ value: formatCount(activePlayers) })),
    },
    {
      label: "Streamers actifs",
      cells: toCells(audience, ({ activeStreamers }) => ({ value: formatCount(activeStreamers) })),
    },
  ];
}

// Celle d'un canvas : ses joueurs actifs, et les nouveaux comptes venus de sa page, à la place des comptes et des streamers.
export function toCanvasAudienceRows(audience: CanvasAudience): StatTableRow[] {
  return [
    ...toVisitRows(audience),
    {
      label: "Joueurs actifs",
      cells: toCells(audience, ({ activePlayers }) => ({ value: formatCount(activePlayers) })),
    },
    {
      label: "Nouveaux comptes venus de sa page",
      cells: toCells(audience, ({ signups }) => ({ value: formatCount(signups) })),
    },
  ];
}

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

// Chaque compte connecté, avec son rôle et depuis quand.
export const toActivityAccounts = (
  accounts: readonly ConnectedAccount[],
  nowMs: Timestamp,
): CanvasActivityAccount[] =>
  accounts.map((account) => ({
    user: account,
    mention: `${roleLabel(account.role)} · ${connectedSince(account.connectedAt, nowMs)}`,
    devices: account.devices,
  }));

export const toGuestsLine = (guests: number): string | null =>
  guests === 0 ? null : `+ ${counted(guests, "invité", "invités")}`;

export function toCanvasActivityCard(
  canvas: ActivityCanvas,
  nowMs: Timestamp,
): Omit<CanvasActivityCardProps, "isOpen" | "onToggle"> {
  const { owner, people, guests, heat, signups, accounts } = canvas;
  return {
    owner,
    facts: [peopleLabel(people, guests), heatLabel(heat), signupsLabel(signups)],
    accounts: toActivityAccounts(accounts, nowMs),
    guestsLine: toGuestsLine(guests),
  };
}
