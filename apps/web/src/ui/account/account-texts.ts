// Les phrases du compte (Écart §14, JOURNAL 2026-10-07) : la pill Compte, les sections de la fenêtre, la connexion.

import { defineTexts, localized } from "../locale/texts";

export const ACCOUNT_TEXTS = defineTexts({
  settings: { fr: "Réglages", en: "Settings" },
  signIn: { fr: "Se connecter", en: "Sign in" },
  signOut: { fr: "Se déconnecter", en: "Sign out" },
  myAccount: { fr: "Mon compte", en: "My account" },
  // `reports` : « 2 signalements », dit dans la langue de la page.
  myAccountPending: localized({
    fr: (reports: string) => `Mon compte · ${reports} en attente`,
    en: (reports) => `My account · ${reports} pending`,
  }),

  // Les sections de la fenêtre.
  canvas: { fr: "Canvas", en: "Canvas" },
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
