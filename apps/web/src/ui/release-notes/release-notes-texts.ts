// Les mots des Nouveautés (§9.9) et leurs publications, la plus récente en haut. Une publication = une date + des lignes ; une ligne =
// un public, un titre, une phrase et, quand elle aide, une vignette. Chaque texte est écrit dans les deux langues, côte à côte.

import { defineTexts, localized } from "../locale/texts";
import type { Release, ReleaseAudience, ReleaseLine, ReleaseThumbnail } from "./release-notes";

export const RELEASE_NOTES_TEXTS = defineTexts({
  title: { fr: "Nouveautés", en: "What's new" },
  documentTitle: { fr: "Nouveautés · LivePlace", en: "What's new · LivePlace" },
  // La phrase sous le titre de la page : ce qu'on y lit, et dans quel ordre.
  intro: {
    fr: "Ce qui change dans LivePlace, du plus récent au plus ancien.",
    en: "What's changing in LivePlace, newest first.",
  },
  // Le titre d'un groupe : ce qui s'adresse à tous n'en a pas, et un seul groupe visible non plus.
  audienceTitles: localized<Record<Exclude<ReleaseAudience, "viewer">, string>>({
    fr: { owner: "Pour les streamers", moderator: "Pour les modérateurs" },
    en: { owner: "For streamers", moderator: "For moderators" },
  }),
  // La vignette est un bouton : son nom accessible dit ce qu'elle fait et de quelle ligne elle vient.
  enlarge: localized({
    fr: (title: string) => `Agrandir : ${title}`,
    en: (title) => `Enlarge: ${title}`,
  }),
  // Le thème qui s'écrit dans la vignette « Un thème pour la fresque » : un exemple, comme celui du champ (Halloween).
  themeExample: { fr: "Aventure", en: "Adventure" },
});

// Avec `exactOptionalPropertyTypes`, une ligne sans vignette n'a pas la clé.
const line = (
  audience: ReleaseAudience,
  texts: ReleaseLine["texts"],
  thumbnail?: ReleaseThumbnail,
): ReleaseLine => (thumbnail ? { audience, texts, thumbnail } : { audience, texts });

// Cinq publications datées, la plus récente en haut. Les phrases françaises sont celles qu'Alexis a validées, mot pour mot ; l'anglais reprend
// les mots que l'interface emploie déjà (eyedropper, cell, report, clear, canvas, viewer, gauge, theme, tutorial…). Une ligne sans vignette
// n'en a pas la clé : elle s'affiche en texte seul.
export const RELEASES: readonly Release[] = [
  {
    date: "2026-11-01",
    lines: [
      line(
        "viewer",
        defineTexts({
          title: { fr: "Annuler, refaire", en: "Undo, redo" },
          sentence: {
            fr: "En Dessin, Ctrl+Z ou la flèche annule ton dernier trait, et l'autre flèche le remet.",
            en: "In Draw, Ctrl+Z or the arrow undoes your last stroke, and the other arrow brings it back.",
          },
        }),
        "undo",
      ),
      line(
        "owner",
        defineTexts({
          title: { fr: "La fresque grandit seule", en: "The canvas grows by itself" },
          sentence: {
            fr: "Avec la taille dynamique, ta fresque s'agrandit quand un dessin approche d'un bord.",
            en: "With dynamic size, your canvas grows when a drawing gets close to an edge.",
          },
        }),
        "growth",
      ),
    ],
  },
  {
    date: "2026-10-18",
    lines: [
      line(
        "viewer",
        defineTexts({
          title: { fr: "Un coup de pouce ?", en: "Need a hand?" },
          sentence: {
            fr: "Des bulles t'expliquent les gestes. Tu peux rejouer le tutoriel.",
            en: "Bubbles explain the gestures. You can replay the tutorial.",
          },
        }),
        "help",
      ),
    ],
  },
  {
    date: "2026-10-11",
    lines: [
      line(
        "viewer",
        defineTexts({
          title: { fr: "Le classement", en: "The scoreboard" },
          sentence: {
            fr: "Découvre qui place le plus de pixels sur la fresque, et ta place.",
            en: "See who places the most pixels on the canvas, and where you rank.",
          },
        }),
        "scoreboard",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "Hello world!", en: "Hello world!" },
          sentence: {
            fr: "Passe LivePlace en français ou en anglais quand tu veux, sans recharger la page.",
            en: "Switch LivePlace between French and English whenever you like, without reloading the page.",
          },
        }),
        "language",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "App mobile", en: "Mobile app" },
          sentence: {
            fr: "Ajoute l'appli sur l'écran d'accueil de ton téléphone, elle s'ouvre en plein écran.",
            en: "Add the app to your phone's home screen, it opens full screen.",
          },
        }),
        "install",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "En live sur Twitch", en: "Live on Twitch" },
          sentence: {
            fr: "Le bouton Twitch d'un profil montre si la personne est en live, et sa catégorie.",
            en: "A profile's Twitch button shows whether that person is live, and their category.",
          },
        }),
        "live",
      ),
      line(
        "moderator",
        defineTexts({
          title: { fr: "Modération facile", en: "Easy moderation" },
          sentence: {
            fr: "Un point rouge sur Modération te prévient dès qu'un signalement attend.",
            en: "A red dot on Moderation tells you as soon as a report is waiting.",
          },
        }),
        "moderation",
      ),
      line(
        "owner",
        defineTexts({
          title: { fr: "Archive et recommence", en: "Archive and start over" },
          sentence: {
            fr: "Archive ta fresque, elle garde son lien, et repars sur une fresque vide.",
            en: "Archive your canvas, it keeps its link, and start over on an empty one.",
          },
        }),
        "archives",
      ),
      line(
        "owner",
        defineTexts({
          title: { fr: "Choisis ton fond", en: "Pick your background" },
          sentence: {
            fr: "Choisis un fond transparent, noir ou blanc, et mets ton image par-dessus.",
            en: "Pick a transparent, black or white background, and put your image on top.",
          },
        }),
        "backgrounds",
      ),
      line(
        "owner",
        defineTexts({
          title: { fr: "Un thème pour la fresque", en: "A theme for your canvas" },
          sentence: {
            fr: "Donne un thème à ta fresque : tous les viewers le voient en haut de l'écran.",
            en: "Give your canvas a theme: every viewer sees it at the top of the screen.",
          },
        }),
        "theme",
      ),
    ],
  },
  {
    date: "2026-10-04",
    lines: [
      line(
        "viewer",
        defineTexts({
          title: { fr: "Signaler un dessin", en: "Report a drawing" },
          sentence: {
            fr: "Signale un dessin gênant : les modérateurs le voient et peuvent l'effacer.",
            en: "Report an unwanted drawing: moderators see it and can clear it.",
          },
        }),
        "report",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "La pipette", en: "The eyedropper" },
          sentence: {
            fr: "Prends la couleur d'un pixel de la fresque avec la pipette ou la touche I.",
            en: "Pick up a pixel's color from the canvas with the eyedropper or the I key.",
          },
        }),
        "eyedropper",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "Dessiner au clavier", en: "Draw with the keyboard" },
          sentence: {
            fr: "Vise une case avec les flèches du clavier, puis dessine sans souris.",
            en: "Aim at a cell with the arrow keys, then draw without a mouse.",
          },
        }),
        "keyboard",
      ),
      line(
        "viewer",
        defineTexts({
          title: { fr: "Augmente ta jauge", en: "Grow your gauge" },
          sentence: {
            fr: "À force de dessiner, un +1 doré apparaît : réclame-le pour augmenter ta jauge.",
            en: "Keep drawing and a golden +1 shows up: claim it to grow your gauge.",
          },
        }),
        "gauge",
      ),
      line(
        "moderator",
        defineTexts({
          title: { fr: "Efface les dessins gênants", en: "Clear unwanted drawings" },
          sentence: {
            fr: "Efface un seul dessin, une plage d'heures ou tous les dessins d'un viewer.",
            en: "Clear a single drawing, a time range, or all of a viewer's drawings.",
          },
        }),
        "clear",
      ),
      line(
        "owner",
        defineTexts({
          title: { fr: "Le format de la fresque", en: "The canvas format" },
          sentence: {
            fr: "Choisis le format de ta fresque : carré, paysage ou portrait, en trois tailles.",
            en: "Pick your canvas format: square, landscape or portrait, in three sizes.",
          },
        }),
        "format",
      ),
    ],
  },
  {
    date: "2026-09-27",
    lines: [
      line(
        "viewer",
        defineTexts({
          title: { fr: "Lancement de LivePlace (bêta)", en: "LivePlace launches (beta)" },
          sentence: {
            fr: "Connecte-toi avec Twitch et dessine à plusieurs sur la fresque d'un streamer, ou sur la tienne.",
            en: "Sign in with Twitch and draw together on a streamer's canvas, or on your own.",
          },
        }),
        "launch",
      ),
    ],
  },
];
