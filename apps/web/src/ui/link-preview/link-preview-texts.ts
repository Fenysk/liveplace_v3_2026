// Les phrases de la carte d'aperçu d'un lien (Écart §14, JOURNAL 2026-10-07). Le robot de Discord, X ou Facebook n'envoie en
// général ni cookie ni `Accept-Language` : il reçoit le français, la langue par défaut.

import { defineTexts, localized } from "../locale/texts";

export const LINK_PREVIEW_TEXTS = defineTexts({
  title: localized({
    fr: (displayName: string) => `Viens dessiner sur le canvas de ${displayName}`,
    en: (displayName) => `Come draw on ${displayName}'s canvas`,
  }),
  description: {
    fr: "Un canvas collaboratif, en direct sur Twitch.",
    en: "A collaborative canvas, live on Twitch.",
  },
});
