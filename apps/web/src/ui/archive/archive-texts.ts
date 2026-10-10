// Les phrases des canvas archivés (Écart §15, JOURNAL 2026-10-06) : les dates, le titre d'une ligne, le bandeau.
// Écart §14 (JOURNAL 2026-10-07) : chacune en français et en anglais.

import { MAX_ARCHIVES, type Timestamp } from "@liveplace/domain";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ChoiceOption } from "../design/choice-list";
import { formatNumber, isSingular, type Locale } from "../locale/locale";
import { defineTexts, localized } from "../locale/texts";

export const archiveHref = (login: string, linkCode: string): string => `/${login}/archives/${linkCode}`;

const FRENCH_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const ENGLISH_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// Les jours de Paris, comme `toParisDay` : le serveur et le navigateur écrivent la même date, sans écart d'hydratation.
// `en-CA` n'est que la façon d'obtenir année, mois et jour : l'affichage est dans les phrases ci-dessous.
const PARIS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export type ParisDate = { year: number; month: number; day: number };

const toParisDate = (timestamp: Timestamp): ParisDate => {
  const parts = PARIS_DATE.formatToParts(timestamp);
  const part = (type: "year" | "month" | "day") => Number(parts.find((each) => each.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
};

const frenchDay = ({ day }: ParisDate): string => (day === 1 ? "1er" : String(day));
const frenchMonth = ({ month }: ParisDate): string => FRENCH_MONTHS[month - 1] ?? "";
const frenchFull = (date: ParisDate): string => `${frenchDay(date)} ${frenchMonth(date)} ${date.year}`;

const englishMonth = ({ month }: ParisDate): string => ENGLISH_MONTHS[month - 1] ?? "";
const englishFull = (date: ParisDate): string => `${englishMonth(date)} ${date.day}, ${date.year}`;

type Themed = { theme?: string | undefined };
type Dated = { createdAt: Timestamp; archivedAt?: Timestamp | undefined };
type ThemeRequest =
  | { kind: "archive"; canvas: { theme?: string } }
  | { kind: "reopen"; archive: { theme?: string } };

// Pourquoi le thème n'a pas été enregistré, en un toast. `network` : pas de réponse, comme `failed` pour le streamer.
export type ThemeFailure = "not_active" | "failed" | "network" | "unauthenticated";

// Pourquoi un changement n'a pas eu lieu, dit au streamer dans la fenêtre qui l'a demandé. `network` : la page n'a
// pas eu de réponse du tout.
export type SwitchFailure =
  | "busy"
  | "not_active"
  | "not_archive"
  | "archives_full"
  | "failed"
  | "unauthenticated"
  | "network";

// Les toasts du streamer qui agit : archiver lui dit où sont ses viewers ; rouvrir et supprimer gardent leurs mots.
export type OwnerAction = "archive" | "reopen" | "discard";

export const ARCHIVE_TEXTS = defineTexts({
  // « du 12 au 18 octobre 2026 », « le 12 octobre 2026 » ; sans date d'archivage, « depuis le 12 octobre 2026 ».
  datesRange: localized({
    fr: (from: ParisDate, to: ParisDate) => {
      if (from.year !== to.year) return `du ${frenchFull(from)} au ${frenchFull(to)}`;
      if (from.month !== to.month) return `du ${frenchDay(from)} ${frenchMonth(from)} au ${frenchFull(to)}`;
      if (from.day === to.day) return `le ${frenchFull(to)}`;
      return `du ${frenchDay(from)} au ${frenchFull(to)}`;
    },
    en: (from, to) => {
      if (from.year !== to.year) return `${englishFull(from)} – ${englishFull(to)}`;
      if (from.month !== to.month) return `${englishMonth(from)} ${from.day} – ${englishFull(to)}`;
      if (from.day === to.day) return englishFull(to);
      return `${englishMonth(from)} ${from.day}–${to.day}, ${to.year}`;
    },
  }),
  datesSince: localized({
    fr: (from: ParisDate) => `depuis le ${frenchFull(from)}`,
    en: (from) => `since ${englishFull(from)}`,
  }),

  // Le libellé du canvas en cours, et son bouton : l'icône d'archive dit le reste.
  currentCanvasLabel: { fr: "Fresque en cours", en: "Current canvas" },
  archiveAction: { fr: "Archiver", en: "Archive" },
  noCurrentCanvas: { fr: "Aucune fresque en cours.", en: "No current canvas." },
  currentThumbnail: { fr: "Miniature de la fresque en cours", en: "Thumbnail of the current canvas" },
  archiveThumbnail: localized({
    fr: (title: string) => `Miniature de l'archive ${title}`,
    en: (title) => `Thumbnail of the ${title} archive`,
  }),
  unavailable: localized({
    fr: (label: string) => `${label} (indisponible)`,
    en: (label) => `${label} (unavailable)`,
  }),
  viewArchive: { fr: "Voir l'archive", en: "View the archive" },
  // Le nom du lien d'une archive pour un lecteur d'écran : son titre, et qu'il ouvre un nouvel onglet.
  openArchive: localized({
    fr: (title: string) => `Ouvrir l'archive ${title} dans un nouvel onglet`,
    en: (title) => `Open the ${title} archive in a new tab`,
  }),
  reopen: { fr: "Rouvrir", en: "Reopen" },
  copyLink: { fr: "Copier le lien", en: "Copy link" },
  discard: { fr: "Supprimer", en: "Delete" },
  retry: { fr: "Réessayer", en: "Try again" },
  linkCopied: { fr: "Lien copié", en: "Link copied" },
  copyRefused: {
    fr: "Copie impossible : le navigateur refuse le presse-papiers.",
    en: "Copy failed: the browser refuses clipboard access.",
  },

  // Le libellé de la liste, « Archives · 1 sur 5 » : de 0 à 5.
  archivesCounter: localized({
    fr: ({ count, max }: { count: number; max: number }) => `Archives · ${count} sur ${max}`,
    en: ({ count, max }) => `Archives · ${count} of ${max}`,
  }),

  // Sans archive, une seule phrase : ce qu'il n'y a pas, et ce que fait archiver.
  noArchive: {
    fr: "Aucune archive pour l'instant. Archiver fige ton dessin, avec son lien, et repart sur une fresque vide.",
    en: "No archive yet. Archiving freezes your drawing, with its link, and starts over on an empty canvas.",
  },
  canvasesUnavailable: {
    fr: "Impossible de lire tes fresques pour l'instant. Réessaie dans un instant.",
    en: "Can't read your canvases right now. Try again in a moment.",
  },

  // Le champ propose un exemple, jamais une consigne.
  themePlaceholder: { fr: "Ex. : Halloween", en: "E.g. Halloween" },

  // Le champ de l'onglet Canvas et celui de la fenêtre Archiver : le thème du canvas en cours, enregistré dans l'onglet
  // quand le champ perd le focus, sans bouton.
  themeLabel: { fr: "Thème", en: "Theme" },
  themeCaption: {
    fr: "Affiché en haut de la fresque, pour tout le monde.",
    en: "Shown at the top of the canvas, for everyone.",
  },
  themeSaved: { fr: "Thème enregistré", en: "Theme saved" },
  // Des `switch` exhaustifs : le compilateur signale toute raison laissée sans phrase.
  themeFailure: localized({
    fr: (failure: ThemeFailure) => {
      switch (failure) {
        case "not_active":
          return "La fresque en cours a changé : son thème est rechargé.";
        case "failed":
        case "network":
          return "Le thème n'a pas pu être enregistré. Réessaie dans un instant.";
        case "unauthenticated":
          return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
      }
    },
    en: (failure) => {
      switch (failure) {
        case "not_active":
          return "The current canvas changed: its theme was reloaded.";
        case "failed":
        case "network":
          return "The theme couldn't be saved. Try again in a moment.";
        case "unauthenticated":
          return "Your session expired. Sign in again, then try again.";
      }
    },
  }),

  // Ce que dit la fenêtre : archiver tient en une phrase sans dimension ; rouvrir et supprimer nomment l'archive.
  archiveTitle: { fr: "Archiver cette fresque ?", en: "Archive this canvas?" },
  reopenTitle: { fr: "Rouvrir cette archive ?", en: "Reopen this archive?" },
  discardTitle: { fr: "Supprimer cette archive ?", en: "Delete this archive?" },
  archiveSentence: {
    fr: "Ton dessin est figé et garde son lien. Tes viewers passent sur une fresque vide.",
    en: "Your drawing is frozen and keeps its link. Your viewers move to an empty canvas.",
  },
  reopenSentence: localized({
    fr: (title: string) => `« ${title} » remplace ta fresque actuelle, qui part dans les archives.`,
    en: (title) => `“${title}” replaces your current canvas, which moves to the archives.`,
  }),
  discardSentence: localized({
    fr: (title: string) => `« ${title} » sera supprimé pour de bon.`,
    en: (title) => `“${title}” will be deleted for good.`,
  }),

  // Le choix des deux fenêtres parle des jauges des viewers, jamais de « progression » : garder leurs jauges actuelles,
  // ou les remettre au départ (archiver) / reprendre celles de l'archive (rouvrir). Libellés courts, sans note.
  progressLabel: { fr: "Les jauges des viewers", en: "Your viewers' gauges" },
  progressOptions: localized<Record<"archive" | "reopen", readonly ChoiceOption<ProgressChoice>[]>>({
    fr: {
      archive: [
        { value: "keep", label: "Garder leurs jauges actuelles" },
        { value: "restart", label: "Remettre les jauges au départ" },
      ],
      reopen: [
        { value: "keep", label: "Garder leurs jauges actuelles" },
        { value: "restart", label: "Reprendre leurs jauges de cette archive" },
      ],
    },
    en: {
      archive: [
        { value: "keep", label: "Keep their current gauges" },
        { value: "restart", label: "Reset the gauges to the start" },
      ],
      reopen: [
        { value: "keep", label: "Keep their current gauges" },
        { value: "restart", label: "Restore their gauges from this archive" },
      ],
    },
  }),

  // Ce que devient ce que les viewers ont signalé sur le canvas qui part : classé sans suite, sans décision. Aucun
  // signalement, aucune ligne.
  reportsSentence: localized({
    fr: (count: number) =>
      isSingular(count, "fr")
        ? `${count} signalement en attente sera classé sans suite.`
        : `${formatNumber(count, "fr")} signalements en attente seront classés sans suite.`,
    en: (count) =>
      isSingular(count, "en")
        ? `${count} pending report will be closed without action.`
        : `${formatNumber(count, "en")} pending reports will be closed without action.`,
  }),

  switchFailure: localized({
    fr: (failure: SwitchFailure) => {
      switch (failure) {
        case "busy":
          return "Un autre changement est en cours. Réessaie dans un instant.";
        case "not_active":
        case "not_archive":
          return "La liste a changé : la voici à jour.";
        case "archives_full":
          return `Tu as déjà ${MAX_ARCHIVES} archives : supprime-en une avant d'archiver.`;
        case "failed":
          return "Le changement n'a pas pu se faire, et rien n'a bougé. Réessaie dans un instant.";
        case "unauthenticated":
          return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
        case "network":
          return "Pas de réponse du serveur. La liste est rechargée : vérifie-la avant de réessayer.";
      }
    },
    en: (failure) => {
      switch (failure) {
        case "busy":
          return "Another change is in progress. Try again in a moment.";
        case "not_active":
        case "not_archive":
          return "The list changed: here it is, up to date.";
        case "archives_full":
          return `You already have ${MAX_ARCHIVES} archives: delete one before archiving.`;
        case "failed":
          return "The change couldn't be made, and nothing moved. Try again in a moment.";
        case "unauthenticated":
          return "Your session expired. Sign in again, then try again.";
        case "network":
          return "No response from the server. The list was reloaded: check it before trying again.";
      }
    },
  }),

  ownerToast: localized<Record<OwnerAction, string>>({
    fr: {
      archive: "Fresque archivée : tes viewers sont sur la nouvelle.",
      reopen: "Archive rouverte",
      discard: "Archive supprimée",
    },
    en: {
      archive: "Canvas archived: your viewers are on the new one.",
      reopen: "Archive reopened",
      discard: "Archive deleted",
    },
  }),

  // Le bandeau d'une archive : le thème en titre, sinon à qui elle est.
  archiveOf: localized({
    fr: (displayName: string) => `Archive de ${displayName}`,
    en: (displayName) => `${displayName}'s archive`,
  }),
  pageTitle: localized({
    fr: (displayName: string) => `Archive de la fresque de ${displayName}`,
    en: (displayName) => `${displayName}'s canvas archive`,
  }),
  downloadAsPng: { fr: "Télécharger en PNG", en: "Download as PNG" },
  download: { fr: "Télécharger", en: "Download" },
  downloadFailed: {
    fr: "Téléchargement impossible : le navigateur n'a pas produit l'image.",
    en: "Download failed: the browser couldn't produce the image.",
  },
  pngBackgroundSentence: {
    fr: "Seules les cases vides du dessin prennent le fond ; les cases colorées ne changent pas.",
    en: "Only the empty cells of the drawing take the background; colored cells stay as they are.",
  },
  pngBackgroundLabel: { fr: "Fond de l'image", en: "Image background" },

  // Une archive introuvable (son bouton est « Voir la fresque de … », celui des profils).
  archiveNotFound: {
    fr: "Cette archive n'existe pas, ou elle a été supprimée.",
    en: "This archive doesn't exist, or it was deleted.",
  },
});

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function datesLabel(createdAt: Timestamp, archivedAt: Timestamp | undefined, locale: Locale): string {
  const from = toParisDate(createdAt);
  return archivedAt === undefined
    ? ARCHIVE_TEXTS[locale].datesSince(from)
    : ARCHIVE_TEXTS[locale].datesRange(from, toParisDate(archivedAt));
}

// Les dates, en tête de phrase : « Du 12 au 18 octobre 2026 ».
export const datesTitle = (createdAt: Timestamp, archivedAt: Timestamp | undefined, locale: Locale): string =>
  capitalized(datesLabel(createdAt, archivedAt, locale));

// Le thème d'abord ; sans thème, ce sont ses dates.
export function canvasTitle({ theme, createdAt, archivedAt }: Themed & Dated, locale: Locale): string {
  return theme ?? datesTitle(createdAt, archivedAt, locale);
}

// La ligne du canvas en cours : le thème en titre, sinon « Depuis le … » ; la légende dit depuis quand, sauf si le titre
// le dit déjà.
export const currentCanvasTitle = ({ theme, createdAt }: Themed & Dated, locale: Locale): string =>
  theme ?? datesTitle(createdAt, undefined, locale);

export const currentCanvasCaption = ({ theme, createdAt }: Themed & Dated, locale: Locale): string | null =>
  theme ? datesLabel(createdAt, undefined, locale) : null;

// La légende d'une archive : ses dates, sauf si elles sont déjà son titre.
export const archiveCaption = (
  { theme, createdAt, archivedAt }: Themed & Required<Dated>,
  locale: Locale,
): string | null => (theme ? datesTitle(createdAt, archivedAt, locale) : null);

// Écart §8.1 (JOURNAL 2026-10-07) : en archivant, le champ propose le thème du canvas actif, qu'une archive rouverte a
// gardé ; vide, il l'effacerait. Rouvrir n'a pas de thème à donner.
export const startingTheme = (request: ThemeRequest): string =>
  request.kind === "archive" ? (request.canvas.theme ?? "") : "";

type BannerArchive = Themed & Required<Dated> & { displayName: string };

export const bannerTitle = (
  { displayName, theme }: Pick<BannerArchive, "displayName" | "theme">,
  locale: Locale,
): string => theme ?? ARCHIVE_TEXTS[locale].archiveOf(displayName);

export const bannerCaption = (
  { displayName, theme, createdAt, archivedAt }: BannerArchive,
  locale: Locale,
): string =>
  theme
    ? `${ARCHIVE_TEXTS[locale].archiveOf(displayName)} · ${datesLabel(createdAt, archivedAt, locale)}`
    : datesTitle(createdAt, archivedAt, locale);

// Ce que devient ce que les viewers ont signalé sur le canvas qui part : aucun signalement, aucune ligne.
export const reportsSentence = (count: number, locale: Locale): string | null =>
  count === 0 ? null : ARCHIVE_TEXTS[locale].reportsSentence(count);

// Le nom affiché que le loader joint à l'introuvable quand le propriétaire existe : `data` n'est connu que comme `unknown`.
export const missingDisplayName = (attached: unknown): string | undefined =>
  typeof attached === "object" &&
  attached !== null &&
  "displayName" in attached &&
  typeof attached.displayName === "string"
    ? attached.displayName
    : undefined;

// La liste se recharge d'elle-même quand la page n'était plus à jour, ou quand le serveur a pu finir sans qu'elle le
// sache : un refus du serveur, ou son échec défait, ne change rien à ce qu'elle montre.
export const shouldReloadAfter = (failure: SwitchFailure): boolean =>
  failure === "not_active" || failure === "not_archive" || failure === "network";
