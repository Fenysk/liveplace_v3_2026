// Le sommaire de /design : cinq chapitres, une entrée à la fois. Des données pures, sans React.

export type DesignChapterId = "foundations" | "components" | "game" | "window" | "dialogs";

export type DesignChapter = { id: DesignChapterId; title: string };

// `place` : où la pill vit sur l'écran de jeu, en deux mots pour le sommaire.
export type DesignEntry<Slug extends string = string> = {
  slug: Slug;
  title: string;
  chapterId: DesignChapterId;
  place?: string;
};

export const DESIGN_CHAPTERS: readonly DesignChapter[] = [
  { id: "foundations", title: "Fondations" },
  { id: "components", title: "Composants" },
  { id: "game", title: "L'écran de jeu" },
  { id: "window", title: "La fenêtre" },
  { id: "dialogs", title: "Les petites fenêtres" },
];

// Une entrée par slug : la clé est l'adresse (`/design#dessin`), l'ordre est celui du sommaire.
const ENTRIES_BY_SLUG = {
  couleurs: { title: "Couleurs", chapterId: "foundations" },
  "palette-du-canvas": { title: "Palette du canvas", chapterId: "foundations" },
  typographie: { title: "Typographie", chapterId: "foundations" },
  mesures: { title: "Mesures", chapterId: "foundations" },
  mouvement: { title: "Mouvement", chapterId: "foundations" },
  icones: { title: "Icônes", chapterId: "foundations" },

  "apercu-de-pixels": { title: "Aperçu de pixels", chapterId: "components" },
  "avatar-et-profil": { title: "Avatar et profil", chapterId: "components" },
  badge: { title: "Badge", chapterId: "components" },
  bouton: { title: "Bouton", chapterId: "components" },
  "carte-d-activite": { title: "Carte d'activité", chapterId: "components" },
  champs: { title: "Champs", chapterId: "components" },
  chiffres: { title: "Chiffres", chapterId: "components" },
  choix: { title: "Choix", chapterId: "components" },
  courbes: { title: "Courbes", chapterId: "components" },
  fenetre: { title: "Fenêtre", chapterId: "components" },
  jauge: { title: "Jauge", chapterId: "components" },
  palette: { title: "Palette", chapterId: "components" },
  pill: { title: "Pill", chapterId: "components" },
  "se-connecter": { title: "Se connecter avec Twitch", chapterId: "components" },
  toast: { title: "Toast", chapterId: "components" },

  "pill-canvas": { title: "Canvas", chapterId: "game", place: "haut gauche" },
  "bandeau-d-archive": { title: "Bandeau d'archive", chapterId: "game", place: "haut gauche" },
  "pill-compte": { title: "Compte", chapterId: "game", place: "haut droite" },
  "pill-classement": { title: "Classement", chapterId: "game", place: "centre gauche" },
  inspection: { title: "Inspection", chapterId: "game", place: "centre droite" },
  dessin: { title: "Dessin", chapterId: "game", place: "bas centre" },
  pratique: { title: "Pratique", chapterId: "game", place: "bas droite" },
  "message-seul": { title: "Message seul", chapterId: "game", place: "centre" },

  "fenetre-canvas": { title: "Canvas", chapterId: "window" },
  archives: { title: "Archives", chapterId: "window" },
  "vue-obs": { title: "Vue OBS", chapterId: "window" },
  moderation: { title: "Modération", chapterId: "window" },
  "fenetre-classement": { title: "Classement", chapterId: "window" },
  "mon-compte": { title: "Mon compte", chapterId: "window" },
  developpeur: { title: "Développeur", chapterId: "window" },

  "taille-du-canvas": { title: "Taille du canvas", chapterId: "dialogs" },
  "jauge-maximale": { title: "Jauge maximale", chapterId: "dialogs" },
  "retirer-bannir-signaler": { title: "Retirer, bannir, signaler", chapterId: "dialogs" },
  banni: { title: "Banni", chapterId: "dialogs" },
  "archiver-ou-rouvrir": { title: "Archiver ou rouvrir", chapterId: "dialogs" },
  "supprimer-une-archive": { title: "Supprimer une archive", chapterId: "dialogs" },
  "telecharger-en-png": { title: "Télécharger en PNG", chapterId: "dialogs" },
} as const satisfies Record<string, Omit<DesignEntry, "slug">>;

export type EntrySlug = keyof typeof ENTRIES_BY_SLUG;

export const DESIGN_ENTRIES: readonly DesignEntry<EntrySlug>[] = (
  Object.keys(ENTRIES_BY_SLUG) as EntrySlug[]
).map((slug) => ({ slug, ...ENTRIES_BY_SLUG[slug] }));

export const DEFAULT_ENTRY_SLUG = "couleurs" satisfies EntrySlug;

const DEFAULT_ENTRY: DesignEntry<EntrySlug> = {
  slug: DEFAULT_ENTRY_SLUG,
  ...ENTRIES_BY_SLUG[DEFAULT_ENTRY_SLUG],
};

// `location.hash` commence par « # » ; le slug seul est accepté aussi. Un hash inconnu ouvre l'entrée par défaut.
export const toEntry = (hash: string): DesignEntry<EntrySlug> =>
  DESIGN_ENTRIES.find(({ slug }) => slug === hash.replace(/^#/, "")) ?? DEFAULT_ENTRY;
