// CDC 2026 §8, Mode événement : l'adresse d'une page Streamlabs Charity, les états de l'événement et ses constantes. Pur : le gateway
// décide de chaque réglage, le worker lit les dons, le web affiche ce que les frames disent.

import { HOUR_MS, MINUTE_MS, type Role, THEME_MAX_LENGTH, type Timestamp, toTheme } from "./index";
import { type DrawingGate, isBoundToLive, OPEN_DRAWING } from "./live-only";

const SECOND_MS = 1_000;
const DAY_MS = 24 * HOUR_MS;

// Un compte créé après le début de l'événement ne réclame un don que dans l'heure qui suit ce don.
export const LATE_ACCOUNT_CLAIM_WINDOW_MS = HOUR_MS;

// Le worker relit la page de dons toutes les 20 s : un don arrive en moins d'une minute, avec deux nouvelles tentatives si
// l'API de Streamlabs Charity ne répond pas. Après la fin, il lit encore 2 min : un don fait juste avant la fin y arrive en retard.
export const CHARITY_READ_EVERY_MS = 20_000;
export const CHARITY_READ_GRACE_MS = 2 * MINUTE_MS;

// Le titre de l'événement : la même borne et le même nettoyage que le thème de la fresque. Vide : l'événement est inactif, rien n'est refusé.
export const CHARITY_TITLE_MAX_LENGTH = THEME_MAX_LENGTH;
export const toCharityTitle = (raw: string): string => toTheme(raw) ?? "";

// Les bornes du fil : l'adresse que le streamer écrit, et le nom que le donateur a écrit (tel quel en deçà, coupé au-delà).
export const CHARITY_ADDRESS_MAX_LENGTH = 300;
export const CHARITY_DONOR_NAME_MAX_LENGTH = 100;

// 1 € donné = 10 pixels : 10 centimes = 1 pixel, arrondi vers le bas (un reste de moins de 10 centimes ne donne rien).
export const CENTS_PER_PIXEL = 10;

export const pixelsOfCents = (cents: number): number => Math.floor(cents / CENTS_PER_PIXEL);

// Les 2 formes d'une page de dons. `memberId` absent : la page de l'équipe entière.
export type CharitySource =
  | { kind: "user"; user: string; campaign: string }
  | { kind: "team"; team: string; campaign: string; memberId?: string };

const CHARITY_HOSTS = ["streamlabscharity.com", "www.streamlabscharity.com"];
const SLUG = /^[A-Za-z0-9_.-]+$/;
const MEMBER_ID = /^\d+$/;

const slugOf = (segment: string | undefined): string | null => {
  if (!segment?.startsWith("@")) return null;
  const slug = segment.slice(1);
  return SLUG.test(slug) ? slug : null;
};

// `null` : « Pas une page Streamlabs Charity ». Le protocole (https) est facultatif, `www.` aussi.
export function parseCharityAddress(text: string): CharitySource | null {
  const trimmed = text.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!CHARITY_HOSTS.includes(url.hostname.toLowerCase()) || url.username || url.password) return null;
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments[0] === "teams") return parseTeamAddress(segments.slice(1), url.searchParams.get("member"));
  if (segments.length !== 2) return null;
  const user = slugOf(segments[0]);
  const campaign = segments[1];
  return user && campaign && SLUG.test(campaign) ? { kind: "user", user, campaign } : null;
}

// Le lien d'une adresse valide, avec son protocole ; `null` : le texte n'est pas une page de dons, il ne devient jamais un lien.
export function charityAddressHref(text: string): string | null {
  if (parseCharityAddress(text) === null) return null;
  const trimmed = text.trim();
  return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).href;
}

const parseTeamAddress = (segments: string[], member: string | null): CharitySource | null => {
  if (segments.length !== 2) return null;
  const team = slugOf(segments[0]);
  const campaign = segments[1];
  if (!team || !campaign || !SLUG.test(campaign)) return null;
  if (member === null) return { kind: "team", team, campaign };
  return MEMBER_ID.test(member) ? { kind: "team", team, campaign, memberId: member } : null;
};

// `endsAt` absent : l'événement dure jusqu'à ce que le streamer l'éteigne.
export type CharityEventDates = { startsAt: Timestamp; endsAt?: Timestamp | undefined };

// Un don compte s'il est fait après le début, et avant la fin quand il y en a une.
export function isDonationInCharityEvent(
  donatedAt: Timestamp,
  { startsAt, endsAt }: CharityEventDates,
): boolean {
  return donatedAt >= startsAt && (endsAt === undefined || donatedAt <= endsAt);
}

// Le réglage que le streamer écrit, tel quel : le serveur le garde et en calcule l'état. `address` vide : un événement sans page de dons.
export type CharityEventSetting = {
  isEnabled: boolean;
  title: string;
  address?: string | undefined;
  startsAt?: Timestamp | undefined;
  endsAt?: Timestamp | undefined;
  // Le dessin des viewers ne s'ouvre qu'entre le début et la fin. Absent : faux.
  isEventOnly?: boolean | undefined;
};

// Pourquoi un événement activé n'a pas lieu, dans l'ordre où le streamer le corrige.
export type CharityInactiveReason = "title" | "start" | "order" | "address";

const isDateOf = (at: Timestamp | undefined): at is Timestamp => at !== undefined && Number.isSafeInteger(at);

export function charityInactiveReasonOf(setting: CharityEventSetting): CharityInactiveReason | null {
  const { title, address, startsAt, endsAt } = setting;
  if (title.trim() === "") return "title";
  if (!isDateOf(startsAt)) return "start";
  if (endsAt !== undefined) {
    if (startsAt >= endsAt) return "order";
  }
  if (address !== undefined && address.trim() !== "" && parseCharityAddress(address) === null)
    return "address";
  return null;
}

export type CharityEventStatus =
  | { kind: "off" }
  | { kind: "inactive"; reason: CharityInactiveReason }
  | { kind: "upcoming"; startsAt: Timestamp }
  | { kind: "running" }
  // Après la Fin, switch activé et réglage valide par ailleurs : la pastille reste jusqu'au switch OFF.
  | { kind: "ended" };

// L'état d'un réglage à cet instant : à venir avant le début, en cours ensuite, terminé après la fin.
export function charityEventStatusOf(setting: CharityEventSetting, nowMs: Timestamp): CharityEventStatus {
  if (!setting.isEnabled) return { kind: "off" };
  const reason = charityInactiveReasonOf(setting);
  if (reason !== null) return { kind: "inactive", reason };
  const startsAt = setting.startsAt ?? 0;
  if (nowMs < startsAt) return { kind: "upcoming", startsAt };
  return setting.endsAt !== undefined && nowMs >= setting.endsAt ? { kind: "ended" } : { kind: "running" };
}

// CDC « Dessin seulement pendant l'événement » : même rôles que le live. Un événement activé sans début, ou dont la fin précède le début, n'a
// pas lieu : le dessin ne reste pas fermé pour rien. Le dessin est ouvert dans [début, fin) : `opensAt` au début, `closesAt` à la fin
// (sans fin, il reste ouvert).
export function charityGate(
  setting: CharityEventSetting | undefined,
  role: Role,
  nowMs: Timestamp,
): DrawingGate {
  if (!setting?.isEnabled || !isBoundToLive(setting.isEventOnly === true, role)) return OPEN_DRAWING;
  const { startsAt, endsAt } = setting;
  if (!isDateOf(startsAt) || (endsAt !== undefined && startsAt >= endsAt)) return OPEN_DRAWING;
  if (nowMs < startsAt) return { isClosed: true, opensAt: startsAt };
  if (endsAt === undefined) return OPEN_DRAWING;
  return nowMs >= endsAt ? { isClosed: true } : { isClosed: false, closesAt: endsAt };
}

// Le temps qui reste avant le début, en deux unités : jours et heures, heures et minutes, puis minutes et secondes.
export type MinutesCountdown = { unit: "minutes"; minutes: number; seconds: number };
export type CharityCountdown =
  | { unit: "days"; days: number; hours: number }
  | { unit: "hours"; hours: number; minutes: number }
  | MinutesCountdown;

const minutesCountdownOf = (left: number): MinutesCountdown => ({
  unit: "minutes",
  minutes: Math.floor(left / MINUTE_MS),
  seconds: Math.floor((left % MINUTE_MS) / SECOND_MS),
});

export function charityCountdownOf(msLeft: number): CharityCountdown {
  const left = Math.max(0, msLeft);
  if (left >= DAY_MS)
    return { unit: "days", days: Math.floor(left / DAY_MS), hours: Math.floor((left % DAY_MS) / HOUR_MS) };
  if (left >= HOUR_MS)
    return {
      unit: "hours",
      hours: Math.floor(left / HOUR_MS),
      minutes: Math.floor((left % HOUR_MS) / MINUTE_MS),
    };
  return minutesCountdownOf(left);
}

// La dernière heure avant une fin, en minutes et secondes ; à 1 h exactement ou plus, `null` : la pastille dit seulement « En cours ».
export const charityEndCountdownOf = (msLeft: number): MinutesCountdown | null =>
  msLeft >= HOUR_MS ? null : minutesCountdownOf(Math.max(0, msLeft));

// Dans combien de ms l'affichage du compte à rebours change, au plus tard au début de l'événement.
export function charityCountdownDelayMs(msLeft: number): number {
  const left = Math.max(0, msLeft);
  const step = left >= DAY_MS ? HOUR_MS : left >= HOUR_MS ? MINUTE_MS : SECOND_MS;
  return Math.max(1, Math.min((left % step) + 1, left));
}

// Un don de Streamlabs Charity, tel que le worker le range : le montant converti, en centimes, dans la devise de la campagne.
export type CharityDonation = {
  id: string;
  name: string;
  cents: number;
  currency: string;
  donatedAt: Timestamp;
};
