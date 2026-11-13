// Les Nouveautés : des publications datées, chacune faite de lignes qui parlent à un public. Le rôle se lit sur le canvas où l'on
// est (comme partout dans LivePlace) : le streamer voit aussi ce qui s'adresse aux modérateurs et à tous, le modérateur ce qui
// s'adresse à tous. Ce qui est lu se retient par appareil, par publication et par public.

import type { Role } from "@liveplace/domain";
import { INTL_TAGS, type Locale } from "../locale/locale";
import type { Localized } from "../locale/texts";

// Les publics, du plus étroit au plus large : `owner` est le streamer sur son canvas (lexique).
export const AUDIENCES = ["owner", "moderator", "viewer"] as const;
export type ReleaseAudience = (typeof AUDIENCES)[number];

// L'ordre des groupes à l'écran : ce qui s'adresse à tous d'abord, puis les modérateurs, puis les streamers.
export const AUDIENCE_DISPLAY_ORDER: readonly ReleaseAudience[] = ["viewer", "moderator", "owner"];

// La vignette d'une ligne : un vrai élément de LivePlace en petit, dessiné par `release-thumbnails.tsx`.
export type ReleaseThumbnail =
  | "archives"
  | "backgrounds"
  | "growth"
  | "scoreboard"
  | "moderation"
  | "undo"
  | "report"
  | "clear"
  | "eyedropper"
  | "keyboard"
  | "gauge"
  | "format"
  | "launch"
  | "help"
  | "language"
  | "install"
  | "live"
  | "theme"
  | "liveOnly";

export type ReleaseLine = {
  audience: ReleaseAudience;
  texts: Localized<{ title: string; sentence: string }>;
  thumbnail?: ReleaseThumbnail;
};

export type ReleaseDate = `${number}-${number}-${number}`;

export type Release = { date: ReleaseDate; lines: readonly ReleaseLine[] };

export type ShownAudience = { audience: ReleaseAudience; lines: readonly ReleaseLine[] };

// Ce qu'un public voit d'une publication : ses groupes, dans l'ordre des groupes, sans les vides.
export type ShownRelease = { date: ReleaseDate; byAudience: readonly ShownAudience[] };

// Des listes fixes : leur identité ne change pas d'un rendu à l'autre, un effet qui en dépend ne repart pas pour rien.
const OWNER_AUDIENCES: readonly ReleaseAudience[] = AUDIENCES;
const MODERATOR_AUDIENCES: readonly ReleaseAudience[] = ["moderator", "viewer"];
const VIEWER_AUDIENCES: readonly ReleaseAudience[] = ["viewer"];

// Un rôle pas encore connu (le gateway n'a pas répondu) et l'invité sont des viewers.
export const audiencesOf = (role: Role | undefined): readonly ReleaseAudience[] => {
  if (role === "owner") return OWNER_AUDIENCES;
  if (role === "moderator") return MODERATOR_AUDIENCES;
  return VIEWER_AUDIENCES;
};

export const shownReleases = (
  releases: readonly Release[],
  audiences: readonly ReleaseAudience[],
): ShownRelease[] =>
  releases.flatMap(({ date, lines }) => {
    const byAudience = AUDIENCE_DISPLAY_ORDER.filter((audience) => audiences.includes(audience))
      .map((audience) => ({ audience, lines: lines.filter((entry) => entry.audience === audience) }))
      .filter(({ lines: audienceLines }) => audienceLines.length > 0);
    return byAudience.length > 0 ? [{ date, byAudience }] : [];
  });

// L'ordre de lecture des vignettes affichées, à partir de 0 : de la première publication à la dernière, groupe par groupe, ligne par ligne.
// Une ligne sans vignette n'en prend pas ; chaque liste (la page, la fenêtre) a le sien.
export const thumbnailOrders = (shown: readonly ShownRelease[]): ReadonlyMap<ReleaseLine, number> => {
  const lines = shown.flatMap(({ byAudience }) => byAudience.flatMap((group) => group.lines));
  return new Map(lines.filter(({ thumbnail }) => thumbnail).map((line, order) => [line, order]));
};

// La clé du « lu » : une par publication et par public, dans le magasin de seen-releases.ts.
export const seenKey = (date: ReleaseDate, audience: ReleaseAudience): string => `${date}:${audience}`;

// Toutes les clés des publications : ce que le point écoute.
export const seenKeysOf = (releases: readonly Release[]): string[] =>
  releases.flatMap(({ date }) => AUDIENCES.map((audience) => seenKey(date, audience)));

// Ce qu'ouvrir la section marque comme lu : une clé par groupe de chaque publication que ces publics voient.
export const seenKeysShown = (
  releases: readonly Release[],
  audiences: readonly ReleaseAudience[],
): string[] =>
  shownReleases(releases, audiences).flatMap(({ date, byAudience }) =>
    byAudience.map(({ audience }) => seenKey(date, audience)),
  );

// Le point : la publication la plus récente qui parle à ces publics a une ligne pas encore lue pour l'un d'eux.
export const hasUnreadRelease = (
  releases: readonly Release[],
  audiences: readonly ReleaseAudience[],
  isRead: (key: string) => boolean,
): boolean => {
  const [latest] = shownReleases(releases, audiences);
  return latest?.byAudience.some(({ audience }) => !isRead(seenKey(latest.date, audience))) ?? false;
};

const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  fr: new Intl.DateTimeFormat(INTL_TAGS.fr, { day: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat(INTL_TAGS.en, { day: "numeric", month: "long", timeZone: "UTC" }),
};

// « 6 novembre », « November 6 » : la date est celle du jour, sans fuseau (UTC), sinon elle glisserait d'un jour.
export const formatReleaseDate = (date: ReleaseDate, locale: Locale): string => {
  const text = DATE_FORMATS[locale].format(new Date(`${date}T00:00:00Z`));
  return locale === "fr" ? text.replace(/^1 /, "1er ") : text;
};
