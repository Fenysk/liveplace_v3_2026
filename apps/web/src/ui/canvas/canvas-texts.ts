// Les phrases du canvas (Écart §14, JOURNAL 2026-10-07) : la page, ses toasts, la section Canvas de la fenêtre, la pill Pratique.

import type { CanvasFormat } from "@liveplace/domain";
import { isSingular } from "../locale/locale";
import { defineTexts, localized } from "../locale/texts";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";

type SizeInCells = { width: number; height: number };

export const CANVAS_TEXTS = defineTexts({
  // Le canvas introuvable, et la page du canvas pour un lecteur d'écran.
  notFound: {
    fr: "Ce pseudo n'a pas encore de fresque sur LivePlace.",
    en: "This username doesn't have a canvas on LivePlace yet.",
  },
  // Redis remet le canvas en place (`canvas_recovering`) : la page le dit à la place du canvas.
  recovering: {
    fr: "On remet chaque pixel à sa place. La fresque revient dans un instant !",
    en: "We're putting every pixel back in place. The canvas will be back in a moment!",
  },
  pageTitle: localized({
    fr: (ownerName: string) => `Fresque de ${ownerName}`,
    en: (ownerName) => `${ownerName}'s canvas`,
  }),
  surfaceLabel: localized({
    fr: ({ ownerName, size }: { ownerName: string; size?: SizeInCells | undefined }) =>
      size ? `Fresque de ${ownerName}, ${size.width} × ${size.height}` : `Fresque de ${ownerName}`,
    en: ({ ownerName, size }) =>
      size ? `${ownerName}'s canvas, ${size.width} × ${size.height}` : `${ownerName}'s canvas`,
  }),
  // Les touches, pour un lecteur d'écran seulement : aucun raccourci ne s'affiche (CDC 2026).
  keysHint: {
    fr: "Au clavier : les flèches visent une case, Maj pour aller dix fois plus loin. D, Entrée ou Espace pour dessiner. En Dessin : Espace ajoute la case visée, Retour arrière la retire, E prend la gomme, I la pipette, Entrée valide, Échap annule.",
    en: "With the keyboard: the arrow keys aim at a cell, Shift goes ten times farther. D, Enter or Space to draw. In Draw mode: Space adds the aimed cell, Backspace removes it, E picks the eraser, I the eyedropper, Enter confirms, Esc cancels.",
  },

  // La pill Canvas repliée sur mobile (Écart §8.1, JOURNAL 2026-10-08) : la photo seule, en bouton qui la déplie.
  unfoldProfile: localized({
    fr: ({ name, isLive }: { name: string; isLive: boolean }) =>
      `Déplier le profil de ${name}${isLive ? ", en live sur Twitch" : ""}`,
    en: ({ name, isLive }) => `Expand ${name}'s profile${isLive ? ", live on Twitch" : ""}`,
  }),

  // La pill Pratique.
  recenter: { fr: "Recentrer la vue", en: "Recenter the view" },
  zoomIn: { fr: "Zoomer", en: "Zoom in" },
  zoomOut: { fr: "Dézoomer", en: "Zoom out" },
  // À quatre chiffres, sans espace : il tient dans la largeur d'un contrôle.
  zoomPercent: localized({
    fr: (percent: number) => (percent < 1000 ? `${percent} %` : `${percent}%`),
    en: (percent) => `${percent}%`,
  }),

  // Les toasts de la page : la connexion, le changement de canvas, les pixels refusés.
  connectionLost: {
    fr: "Connexion perdue : la page se reconnecte.",
    en: "Connection lost: the page is reconnecting.",
  },
  reconnected: { fr: "Reconnecté", en: "Reconnected" },
  switched: localized({
    fr: ({ ownerName, hasDraft }: { ownerName: string; hasDraft: boolean }) =>
      hasDraft
        ? `${ownerName} a changé de fresque : ton brouillon reste sur l'ancienne.`
        : `${ownerName} a changé de fresque.`,
    en: ({ ownerName, hasDraft }) =>
      hasDraft
        ? `${ownerName} switched canvas: your draft stays on the old one.`
        : `${ownerName} switched canvas.`,
  }),
  refused: localized({
    fr: (count: number) =>
      isSingular(count, "fr")
        ? `${MODERATION_TEXTS.fr.pixelCount(count)} refusé : il reste dans le brouillon.`
        : `${MODERATION_TEXTS.fr.pixelCount(count)} refusés : ils restent dans le brouillon.`,
    en: (count) =>
      isSingular(count, "en")
        ? `${MODERATION_TEXTS.en.pixelCount(count)} refused: it stays in the draft.`
        : `${MODERATION_TEXTS.en.pixelCount(count)} refused: they stay in the draft.`,
  }),

  // La section Canvas de la fenêtre : le nom, la taille, la confirmation.
  cellsLabel: localized({
    fr: ({ width, height }: SizeInCells) => `${width} × ${height} cases`,
    en: ({ width, height }) => `${width} × ${height} cells`,
  }),
  sizeChanged: localized({
    fr: ({ width, height }: SizeInCells) => `Taille changée : ${width} × ${height} cases`,
    en: ({ width, height }) => `Size changed: ${width} × ${height} cells`,
  }),
  canvasSize: { fr: "Taille de la fresque", en: "Canvas size" },
  currentSize: localized({
    fr: (size: string) => `Actuellement ${size}.`,
    en: (size) => `Currently ${size}.`,
  }),
  format: { fr: "Format", en: "Format" },
  size: { fr: "Taille", en: "Size" },
  formatNames: localized<Record<CanvasFormat, string>>({
    fr: {
      "1:1": "Carré",
      "16:9": "Paysage 16:9",
      "9:16": "Portrait 9:16",
      "4:3": "Paysage 4:3",
      "3:4": "Portrait 3:4",
    },
    en: {
      "1:1": "Square",
      "16:9": "Landscape 16:9",
      "9:16": "Portrait 9:16",
      "4:3": "Landscape 4:3",
      "3:4": "Portrait 3:4",
    },
  }),
  // Petit, Moyen, Grand : la place d'une taille dans son format, en texte (ce que les boutons radio savent porter).
  sizeNames: localized<Record<"0" | "1" | "2", string>>({
    fr: { "0": "Petit", "1": "Moyen", "2": "Grand" },
    en: { "0": "Small", "1": "Medium", "2": "Large" },
  }),
  chosenSize: localized({
    fr: ({ format, size }: { format: string; size: string }) =>
      `${format}, ${size}. Rien ne se perd : ce qui sort du cadre revient quand la fresque s'agrandit.`,
    en: ({ format, size }) =>
      `${format}, ${size}. Nothing is lost: whatever falls outside the frame comes back when the canvas grows.`,
  }),
  changeSize: { fr: "Changer la taille", en: "Change size" },
  resizeTitle: localized({
    fr: (size: string) => `Passer à ${size} ?`,
    en: (size) => `Switch to ${size}?`,
  }),
  outsideLabel: { fr: "Les pixels qui sortent du cadre", en: "The pixels outside the frame" },
  outsideSentence: localized({
    fr: (count: number) =>
      `${MODERATION_TEXTS.fr.pixelCount(count)} ${isSingular(count, "fr") ? "sort" : "sortent"} du cadre : gardés, invisibles, ils reviennent quand la fresque s'agrandit.`,
    en: (count) =>
      `${MODERATION_TEXTS.en.pixelCount(count)} ${isSingular(count, "en") ? "falls" : "fall"} outside the frame: kept, invisible, ${isSingular(count, "en") ? "it comes" : "they come"} back when the canvas grows.`,
  }),
  nothingOutside: {
    fr: "Aucun pixel posé ne sort du cadre.",
    en: "No placed pixel falls outside the frame.",
  },

  // Les jauges des joueurs (JOURNAL 2026-09-30), montrées dans `/design` pour l'instant.
  playerGauge: { fr: "Jauge des joueurs", en: "Player gauge" },
  playerGaugeNote: {
    fr: "Chaque joueur part de la jauge de départ et la fait grandir en posant sur ta fresque : un premier +1 à réclamer au 12e pixel, puis de plus en plus espacés, jusqu'à la jauge maximale.",
    en: "Every player starts from the starting gauge and grows it by placing on your canvas: a first +1 to claim at the 12th pixel, then further and further apart, up to the maximum gauge.",
  },
  startingGauge: { fr: "Jauge de départ", en: "Starting gauge" },
  maximumGauge: { fr: "Jauge maximale", en: "Maximum gauge" },
  lowerTitle: localized({
    fr: (ceiling: number) => `Baisser la jauge maximale à ${ceiling} ?`,
    en: (ceiling) => `Lower the maximum gauge to ${ceiling}?`,
  }),
  lowerSentence: localized({
    fr: (ceiling: number) =>
      `Les joueurs au-dessus de ${ceiling} charges vont redescendre. Ce qu'ils ont réclamé reste acquis : ils le retrouvent si la jauge maximale remonte.`,
    en: (ceiling) =>
      `Players above ${ceiling} charges will drop back down. What they claimed stays theirs: they get it back if the maximum gauge goes up again.`,
  }),
  lower: { fr: "Baisser", en: "Lower" },
});
