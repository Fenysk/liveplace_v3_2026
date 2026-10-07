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
  // Le titre du bouton de langue dit l'action : passer dans l'autre langue, nommée dans la langue de la page.
  switchTo: {
    fr: { fr: "Passer en français", en: "Passer en anglais" },
    en: { fr: "Switch to French", en: "Switch to English" },
  },
  theme: { fr: "Thème", en: "Theme" },
  themeAuto: { fr: "Auto", en: "Auto" },
  themeLight: { fr: "Clair", en: "Light" },
  themeDark: { fr: "Sombre", en: "Dark" },
  themeTip: localized({ fr: (choice: string) => `Thème : ${choice}`, en: (choice) => `Theme: ${choice}` }),

  viewCanvasOf: localized({
    fr: (name: string) => `Voir le canvas de ${name}`,
    en: (name) => `View ${name}'s canvas`,
  }),
  twitchChannelOf: localized({
    fr: (name: string) => `Chaîne Twitch de ${name}`,
    en: (name) => `${name}'s Twitch channel`,
  }),
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

  claimGauge: {
    fr: "Augmenter la jauge de +1 pixel",
    en: "Raise the gauge by +1 pixel",
  },
  charges: { fr: "Charges", en: "Charges" },

  // Le fond d'une image : le PNG d'une archive, la vue OBS (SwatchChoice).
  backgroundNames: localized<Record<ObsBackground, string>>({
    fr: { transparent: "Transparent", black: "Noir", white: "Blanc" },
    en: { transparent: "Transparent", black: "Black", white: "White" },
  }),

  eraser: { fr: "Gomme", en: "Eraser" },
  eraserTip: { fr: "Gomme (E)", en: "Eraser (E)" },
  colorName: localized({ fr: (color: string) => `Couleur ${color}`, en: (color) => `Color ${color}` }),
  allColors: { fr: "Toutes les couleurs", en: "All colors" },
});
