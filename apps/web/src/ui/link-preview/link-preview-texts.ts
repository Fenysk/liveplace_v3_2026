// Les phrases de la carte d'aperçu d'un lien (§9.9). Le robot de Discord, X ou Facebook n'envoie en
// général ni cookie ni `Accept-Language` : il reçoit le français, la langue par défaut.

import { defineTexts, localized } from "../locale/texts";

export const LINK_PREVIEW_TEXTS = defineTexts({
  title: localized({
    fr: (displayName: string) => `Viens dessiner sur la fresque de ${displayName}`,
    en: (displayName) => `Come draw on ${displayName}'s canvas`,
  }),
  // L'invitation de l'image, sur deux lignes forcées : le pseudo vient dessous, en grand (§9.10).
  invitation: localized<readonly [first: string, second: string]>({
    fr: ["Viens dessiner sur", "la fresque de"],
    en: ["Come draw on", "the canvas of"],
  }),
  description: {
    fr: "Une fresque collaborative, en direct sur Twitch.",
    en: "A collaborative canvas, live on Twitch.",
  },
});
