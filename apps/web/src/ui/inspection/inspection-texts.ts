// Les phrases de la pill Inspection (Écart §14, JOURNAL 2026-10-07) : l'auteur d'un pixel, sa date, signaler et modérer.

import { defineTexts, localized } from "../locale/texts";

export const INSPECTION_TEXTS = defineTexts({
  nobodyYet: { fr: "Personne n'a encore posé ici", en: "Nobody has placed here yet" },
  transparentEraser: { fr: "Transparent (gomme)", en: "Transparent (eraser)" },
  placedOn: localized({ fr: (date: string) => `Posé le ${date}`, en: (date) => `Placed on ${date}` }),
  justNow: { fr: "à l’instant", en: "just now" },

  report: { fr: "Signaler", en: "Report" },
  reported: { fr: "Signalé", en: "Reported" },
  clearTheirPixels: { fr: "Retirer ses pixels", en: "Clear their pixels" },
  ban: { fr: "Bannir", en: "Ban" },

  // JOURNAL 2026-09-27 : pour le streamer. Nommé ici, il se retire ici ; venu de Twitch seul, il se retire sur Twitch.
  removeModerator: { fr: "Retirer modérateur", en: "Remove moderator" },
  makeModerator: { fr: "Nommer modérateur", en: "Make moderator" },
  twitchModerator: { fr: "Modérateur Twitch", en: "Twitch moderator" },
  twitchModeratorTip: {
    fr: "Il se retire depuis ta chaîne Twitch",
    en: "Remove them from your Twitch channel",
  },
});
