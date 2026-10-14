// Les phrases du compte (Écart §14, JOURNAL 2026-10-07) : la pill Compte, les sections de la fenêtre, la connexion.

import { defineTexts, localized } from "../locale/texts";

export const ACCOUNT_TEXTS = defineTexts({
  settings: { fr: "Réglages", en: "Settings" },
  signIn: { fr: "Se connecter", en: "Sign in" },
  signOut: { fr: "Se déconnecter", en: "Sign out" },
  myAccount: { fr: "Mon compte", en: "My account" },
  // Rejouer le tutoriel (Écart §8.1, JOURNAL 2026-10-12) : la rangée de Mon compte, son bouton, et le toast qui le confirme.
  tutorial: { fr: "Tutoriel", en: "Tutorial" },
  tutorialRestart: { fr: "Revoir le tuto", en: "Replay the tutorial" },
  tutorialRestarted: { fr: "Le tuto repart du début", en: "The tutorial starts over" },
  // `reports` : « 2 signalements », dit dans la langue de la page ; `title` : Mon compte ou Modération.
  withPending: localized({
    fr: (title: string, reports: string) => `${title} · ${reports} en attente`,
    en: (title, reports) => `${title} · ${reports} pending`,
  }),

  // Les sections de la fenêtre.
  canvas: { fr: "Fresque", en: "Canvas" },
  archives: { fr: "Archives", en: "Archives" },
  obsView: { fr: "Vue OBS", en: "OBS view" },
  moderation: { fr: "Modération", en: "Moderation" },
  scoreboard: { fr: "Classement", en: "Scoreboard" },

  // Les réponses en texte brut de `/auth/twitch/callback`, que le visiteur lit quand la connexion échoue.
  signInRefused: { fr: "Connexion refusée : state invalide.", en: "Sign-in refused: invalid state." },
  signInFailed: {
    fr: "La connexion Twitch a échoué. Réessaie dans un instant.",
    en: "Twitch sign-in failed. Try again in a moment.",
  },
});
