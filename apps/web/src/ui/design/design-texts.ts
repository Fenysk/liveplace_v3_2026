// Les phrases du design system (Écart §14, JOURNAL 2026-10-07) : celles que ses composants écrivent eux-mêmes, et les
// mots que les fenêtres du jeu se partagent (Annuler, Fermer, Chargement…).

import type { ObsBackground } from "@liveplace/domain";
import { defineTexts, localized } from "../locale/texts";

export const DESIGN_TEXTS = defineTexts({
  cancel: { fr: "Annuler", en: "Cancel" },
  close: { fr: "Fermer", en: "Close" },
  closeTip: { fr: "Fermer (Échap)", en: "Close (Esc)" },
  escapeKey: { fr: "Échap", en: "Esc" },
  loading: { fr: "Chargement…", en: "Loading…" },
  sections: { fr: "Sections", en: "Sections" },

  language: { fr: "Langue", en: "Language" },
  appearance: { fr: "Apparence", en: "Appearance" },
  appearanceAuto: { fr: "Auto", en: "Auto" },
  appearanceLight: { fr: "Clair", en: "Light" },
  appearanceDark: { fr: "Sombre", en: "Dark" },
  appearanceTip: localized({
    fr: (choice: string) => `Apparence : ${choice}`,
    en: (choice) => `Appearance: ${choice}`,
  }),
  // La pill Thème, en haut : le thème du canvas, donné par le streamer. Le petit mot seul sert sur mobile.
  theme: { fr: "Thème", en: "Theme" },
  themeDraw: { fr: "Dessine sur le thème", en: "Draw the theme" },

  viewCanvasOf: localized({
    fr: (name: string) => `Voir la fresque de ${name}`,
    en: (name) => `View ${name}'s canvas`,
  }),
  twitchChannelOf: localized({
    fr: (name: string) => `Chaîne Twitch de ${name}`,
    en: (name) => `${name}'s Twitch channel`,
  }),
  // Un compte en live : l'infobulle de son bouton Twitch (la catégorie, si Twitch la donne), et le mot sans catégorie.
  liveOnTwitch: localized({
    fr: (name: string, category: string | undefined) =>
      `${name} est en live sur Twitch${category ? ` : ${category}` : ""}`,
    en: (name, category) => `${name} is live on Twitch${category ? `: ${category}` : ""}`,
  }),
  liveLabel: { fr: "En live", en: "Live" },
  noAccount: {
    fr: "Cette personne n'a pas de compte LivePlace.",
    en: "This person doesn't have a LivePlace account.",
  },

  signInWithTwitch: { fr: "Se connecter avec Twitch", en: "Sign in with Twitch" },
  signInNote: { fr: "En te connectant, tu acceptes la ", en: "By signing in, you accept the " },
  privacyPolicy: { fr: "politique de confidentialité", en: "privacy policy" },

  copy: localized({ fr: (value: string) => `Copier ${value}`, en: (value) => `Copy ${value}` }),
  copyAction: { fr: "Copier", en: "Copy" },
  copied: { fr: "Copié", en: "Copied" },

  // Le +1 dit son effet par le chiffre : la jauge actuelle + 1 (Écart §9.3, JOURNAL 2026-10-13).
  claimGauge: localized({
    fr: (gaugeMax: number) => `Réclamer : ta jauge passe à ${gaugeMax + 1} pixels`,
    en: (gaugeMax) => `Claim: your gauge goes up to ${gaugeMax + 1} pixels`,
  }),
  // Le nom du `<meter>` de la jauge, lu par les lecteurs d'écran.
  charges: { fr: "Pixels", en: "Pixels" },

  // Le fond d'une image : le PNG d'une archive, la fresque (SwatchChoice).
  backgroundNames: localized<Record<ObsBackground, string>>({
    fr: { transparent: "Transparent", black: "Noir", white: "Blanc" },
    en: { transparent: "Transparent", black: "Black", white: "White" },
  }),

  eraser: { fr: "Gomme", en: "Eraser" },
  eraserTip: { fr: "Gomme (E)", en: "Eraser (E)" },
  colorName: localized({ fr: (color: string) => `Couleur ${color}`, en: (color) => `Color ${color}` }),
  allColors: { fr: "Toutes les couleurs", en: "All colors" },
});
