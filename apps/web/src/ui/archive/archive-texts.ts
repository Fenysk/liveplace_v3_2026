// Les phrases des canvas archivés (Écart §15, JOURNAL 2026-10-06) : les dates, le titre d'une ligne, le bandeau.

import type { Timestamp } from "@liveplace/domain";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ChoiceOption } from "../design/choice-list";

export const archiveHref = (login: string, linkCode: string): string => `/${login}/archives/${linkCode}`;

const MONTHS = [
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

// Les jours de Paris, comme `toParisDay` : le serveur et le navigateur écrivent la même date, sans écart d'hydratation.
const PARIS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

type ParisDate = { year: number; month: number; day: number };

const toParisDate = (timestamp: Timestamp): ParisDate => {
  const parts = PARIS_DATE.formatToParts(timestamp);
  const part = (type: "year" | "month" | "day") => Number(parts.find((each) => each.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
};

const dayLabel = ({ day }: ParisDate): string => (day === 1 ? "1er" : String(day));
const monthLabel = ({ month }: ParisDate): string => MONTHS[month - 1] ?? "";
const fullLabel = (date: ParisDate): string => `${dayLabel(date)} ${monthLabel(date)} ${date.year}`;

// « du 12 au 18 octobre 2026 », « le 12 octobre 2026 » ; sans date d'archivage, « depuis le 12 octobre 2026 ».
export function datesLabel(createdAt: Timestamp, archivedAt?: Timestamp): string {
  const from = toParisDate(createdAt);
  if (archivedAt === undefined) return `depuis le ${fullLabel(from)}`;
  const to = toParisDate(archivedAt);
  if (from.year !== to.year) return `du ${fullLabel(from)} au ${fullLabel(to)}`;
  if (from.month !== to.month) return `du ${dayLabel(from)} ${monthLabel(from)} au ${fullLabel(to)}`;
  if (from.day === to.day) return `le ${fullLabel(to)}`;
  return `du ${dayLabel(from)} au ${fullLabel(to)}`;
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// Les dates, en tête de phrase : « Du 12 au 18 octobre 2026 ».
export const datesTitle = (createdAt: Timestamp, archivedAt?: Timestamp): string =>
  capitalized(datesLabel(createdAt, archivedAt));

// Le thème d'abord ; sans thème, ce sont ses dates.
export function canvasTitle({
  theme,
  createdAt,
  archivedAt,
}: {
  theme?: string;
  createdAt: Timestamp;
  archivedAt?: Timestamp;
}): string {
  return theme ?? datesTitle(createdAt, archivedAt);
}

// Le libellé du canvas en cours, et son bouton : l'icône d'archive dit le reste.
export const CURRENT_CANVAS_LABEL = "Canvas en cours";
export const ARCHIVE_ACTION = "Archiver";

// La ligne du canvas en cours : le thème en titre, sinon « Depuis le … » ; la légende dit depuis quand, sauf si le titre
// le dit déjà.
export const currentCanvasTitle = ({
  theme,
  createdAt,
}: {
  theme?: string | undefined;
  createdAt: Timestamp;
}): string => theme ?? datesTitle(createdAt);

export const currentCanvasCaption = ({
  theme,
  createdAt,
}: {
  theme?: string | undefined;
  createdAt: Timestamp;
}): string | null => (theme ? datesLabel(createdAt) : null);

// La légende d'une archive : ses dates, sauf si elles sont déjà son titre.
export const archiveCaption = ({
  theme,
  createdAt,
  archivedAt,
}: {
  theme?: string | undefined;
  createdAt: Timestamp;
  archivedAt: Timestamp;
}): string | null => (theme ? datesTitle(createdAt, archivedAt) : null);

// Le nom du lien d'une archive pour un lecteur d'écran : son titre, et qu'il ouvre un nouvel onglet.
export const openArchiveLabel = (title: string): string => `Ouvrir l'archive ${title} dans un nouvel onglet`;

// Le libellé de la liste, « Archives · 1 sur 5 » : de 0 à 5.
export const archivesCounter = (count: number, max: number): string => `Archives · ${count} sur ${max}`;

export const NO_CURRENT_CANVAS = "Aucun canvas en cours.";

// Sans archive, une seule phrase : ce qu'il n'y a pas, et ce que fait archiver.
export const NO_ARCHIVE_SENTENCE =
  "Aucune archive pour l'instant. Archiver fige ton dessin, avec son lien, et repart sur un canvas vide.";

type ThemeRequest =
  | { kind: "archive"; canvas: { theme?: string } }
  | { kind: "reopen"; archive: { theme?: string } };

// Écart §8.1 (JOURNAL 2026-10-07) : en archivant, le champ propose le thème du canvas actif, qu'une archive rouverte a
// gardé ; vide, il l'effacerait. Rouvrir n'a pas de thème à donner.
export const startingTheme = (request: ThemeRequest): string =>
  request.kind === "archive" ? (request.canvas.theme ?? "") : "";

// Le champ propose un exemple, jamais une consigne.
export const THEME_PLACEHOLDER = "Ex. : Halloween";

// Le champ de l'onglet Canvas et celui de la fenêtre Archiver : le thème du canvas en cours, enregistré dans l'onglet
// quand le champ perd le focus, sans bouton.
export const THEME_LABEL = "Thème";
export const THEME_CAPTION = "Affiché en haut du canvas, pour tout le monde.";
export const THEME_SAVED = "Thème enregistré";

// Pourquoi le thème n'a pas été enregistré, en un toast. `network` : pas de réponse, comme `failed` pour le streamer.
export type ThemeFailure = "not_active" | "failed" | "network" | "unauthenticated";

export function themeFailureLabel(failure: ThemeFailure): string {
  switch (failure) {
    case "not_active":
      return "Le canvas en cours a changé : son thème est rechargé.";
    case "failed":
    case "network":
      return "Le thème n'a pas pu être enregistré. Réessaie dans un instant.";
    case "unauthenticated":
      return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
  }
}

// Ce que dit la fenêtre : archiver tient en une phrase sans dimension ; rouvrir et supprimer nomment l'archive.
export const ARCHIVE_SENTENCE =
  "Ton dessin est figé et garde son lien. Tes viewers passent sur un canvas vide.";

export const reopenSentence = (title: string): string =>
  `« ${title} » remplace ton canvas actuel, qui part dans les archives.`;

export const discardSentence = (title: string): string => `« ${title} » sera supprimé pour de bon.`;

// Le choix des deux fenêtres parle des jauges des viewers, jamais de « progression » : garder leurs jauges actuelles, ou
// les remettre au départ (archiver) / reprendre celles de l'archive (rouvrir). Libellés courts, sans note.
export const PROGRESS_LABEL = "Les jauges des viewers";

export const progressOptions = (kind: "archive" | "reopen"): readonly ChoiceOption<ProgressChoice>[] => [
  { value: "keep", label: "Garder leurs jauges actuelles" },
  {
    value: "restart",
    label: kind === "archive" ? "Remettre les jauges au départ" : "Reprendre leurs jauges de cette archive",
  },
];

type BannerArchive = {
  displayName: string;
  theme?: string | undefined;
  createdAt: Timestamp;
  archivedAt: Timestamp;
};

// Le bandeau d'une archive : le thème en titre, sinon à qui elle est ; la légende dit les dates, et à qui elle est quand
// le thème a pris le titre.
export const bannerTitle = ({ displayName, theme }: Pick<BannerArchive, "displayName" | "theme">): string =>
  theme ?? `Archive de ${displayName}`;

export const bannerCaption = ({ displayName, theme, createdAt, archivedAt }: BannerArchive): string =>
  theme
    ? `Archive de ${displayName} · ${datesLabel(createdAt, archivedAt)}`
    : datesTitle(createdAt, archivedAt);

// Le bouton de l'archive introuvable : le nom affiché de son streamer, et le pseudo quand il n'existe pas du tout.
export const ownerCanvasLabel = ({
  login,
  displayName,
}: {
  login: string;
  displayName?: string | undefined;
}): string => `Voir le canvas de ${displayName ?? login}`;

// Le nom affiché que le loader joint à l'introuvable quand le propriétaire existe : `data` n'est connu que comme `unknown`.
export const missingDisplayName = (attached: unknown): string | undefined =>
  typeof attached === "object" &&
  attached !== null &&
  "displayName" in attached &&
  typeof attached.displayName === "string"
    ? attached.displayName
    : undefined;

export const CANVASES_UNAVAILABLE = "Impossible de lire tes canvas pour l'instant. Réessaie dans un instant.";

// Ce que devient ce que les viewers ont signalé sur le canvas qui part : classé sans suite, sans décision. Aucun
// signalement, aucune ligne.
export function reportsSentence(count: number): string | null {
  if (count === 0) return null;
  if (count === 1) return "1 signalement en attente sera classé sans suite.";
  return `${count.toLocaleString("fr-FR")} signalements en attente seront classés sans suite.`;
}

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

// Un `switch` exhaustif : le compilateur signale toute raison laissée sans phrase.
export function switchFailureLabel(failure: SwitchFailure): string {
  switch (failure) {
    case "busy":
      return "Un autre changement est en cours. Réessaie dans un instant.";
    case "not_active":
    case "not_archive":
      return "La liste a changé : la voici à jour.";
    case "archives_full":
      return "Tu as déjà 5 archives : supprime-en une avant d'archiver.";
    case "failed":
      return "Le changement n'a pas pu se faire, et rien n'a bougé. Réessaie dans un instant.";
    case "unauthenticated":
      return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
    case "network":
      return "Pas de réponse du serveur. La liste est rechargée : vérifie-la avant de réessayer.";
  }
}

// Les toasts du streamer qui agit : archiver lui dit où sont ses viewers ; rouvrir et supprimer gardent leurs mots.
export type OwnerAction = "archive" | "reopen" | "discard";

const OWNER_TOASTS: Record<OwnerAction, string> = {
  archive: "Canvas archivé : tes viewers sont sur le nouveau.",
  reopen: "Archive rouverte",
  discard: "Archive supprimée",
};

export const ownerToast = (action: OwnerAction): string => OWNER_TOASTS[action];

// La liste se recharge d'elle-même quand la page n'était plus à jour, ou quand le serveur a pu finir sans qu'elle le
// sache : un refus du serveur, ou son échec défait, ne change rien à ce qu'elle montre.
export const shouldReloadAfter = (failure: SwitchFailure): boolean =>
  failure === "not_active" || failure === "not_archive" || failure === "network";
