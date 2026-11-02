// Les phrases de la suppression du compte (CDC §8, §9.9) : la ligne de Mon compte, la fenêtre de confirmation, l'échec, et le toast
// de l'accueil. Le texte de la fenêtre est celui qu'Alexis a validé sur la maquette du 2026-11-01.

import { defineTexts } from "../locale/texts";

export const DELETE_ACCOUNT_TEXTS = defineTexts({
  // La ligne de Mon compte, sous un filet.
  rowHint: { fr: "Efface tout, sans retour.", en: "Erases everything, no undo." },
  deleteAccount: { fr: "Supprimer mon compte", en: "Delete my account" },
  deleting: { fr: "Suppression…", en: "Deleting…" },

  // La fenêtre de confirmation : la seule, sans motif demandé.
  title: { fr: "Supprimer ton compte ?", en: "Delete your account?" },
  immediate: { fr: "C'est immédiat, et sans retour.", en: "It's immediate, and there's no undo." },
  whatGoes: { fr: "Ce qui part :", en: "What goes away:" },
  goesCanvas: {
    fr: "ta fresque, tes archives et ta vue OBS",
    en: "your canvas, your archives and your OBS view",
  },
  goesBadges: { fr: "tes badges et ton classement", en: "your badges and your ranking" },
  goesModerator: { fr: "tes rôles de modérateur", en: "your moderator roles" },
  whatStays: { fr: "Ce qui reste :", en: "What stays:" },
  staysPixels: {
    fr: "tes pixels sur les autres fresques, sans ton nom.",
    en: "your pixels on other canvases, without your name.",
  },
  cannotErase: { fr: "LivePlace ne peut pas effacer :", en: "LivePlace can't erase:" },
  twitchAccess: { fr: "l'accès donné dans", en: "the access you gave in" },
  twitchConnections: { fr: "tes connexions Twitch", en: "your Twitch connections" },

  // L'échec : la fenêtre reste ouverte et le dit. `signedOut` : la session n'est plus valide.
  failed: {
    fr: "La suppression n'a pas abouti. Réessaie dans un instant.",
    en: "The deletion didn't go through. Try again in a moment.",
  },
  signedOut: {
    fr: "Tu n'es plus connecté. Connecte-toi, puis réessaie.",
    en: "You're signed out. Sign in, then try again.",
  },

  // Le toast de l'accueil, après le retour.
  deleted: { fr: "Compte supprimé", en: "Account deleted" },
});
