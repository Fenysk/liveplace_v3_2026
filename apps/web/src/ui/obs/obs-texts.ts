// Les phrases de la vue OBS (Écart §14, JOURNAL 2026-10-07) : la surface qu'OBS affiche, et la section de la fenêtre.

import { defineTexts, localized } from "../locale/texts";

export const OBS_TEXTS = defineTexts({
  // Le nom accessible de la surface, que le stream ne montre jamais.
  surfaceLabel: { fr: "La fresque, telle que le stream la montre", en: "The canvas, as the stream shows it" },

  // Un cran du délai (JOURNAL 2026-09-25) : « Aucun » est le seul à changer, « 10 s » et « 2 min » se disent pareil.
  delayNone: { fr: "Aucun", en: "None" },
  delaySaved: localized({
    fr: (delay: string) => `Délai enregistré : ${delay}`,
    en: (delay) => `Delay saved: ${delay}`,
  }),
  backgroundSaved: localized({
    fr: (background: string) => `Fond enregistré : ${background.toLowerCase()}`,
    en: (background) => `Background saved: ${background.toLowerCase()}`,
  }),

  address: { fr: "Adresse à coller dans OBS", en: "Address to paste into OBS" },
  howTo: {
    fr: "Dans OBS Studio ou Streamlabs : Sources, +, Navigateur. Colle l'adresse, choisis une taille aux proportions de ta fresque (1080 × 1080 pour un carré, 1920 × 1080 pour un 16:9). C'est tout.",
    en: "In OBS Studio or Streamlabs: Sources, +, Browser. Paste the address, pick a size that matches your canvas proportions (1080 × 1080 for a square, 1920 × 1080 for 16:9). That's it.",
  },
  delay: { fr: "Délai", en: "Delay" },
  delayNote: {
    fr: "Le temps de retirer un pixel avant qu'il n'arrive sur le stream.",
    en: "Time to clear a pixel before it reaches the stream.",
  },
  background: { fr: "Fond de la vue OBS", en: "OBS view background" },
  backgroundNote: {
    fr: "Transparent, le stream montre ce qu'il y a derrière les pixels. Noir ou blanc, la fresque se pose sur ce fond.",
    en: "Transparent, the stream shows whatever is behind the pixels. Black or white, the canvas sits on that background.",
  },
});
