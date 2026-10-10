// Les phrases du conseil de première visite (Écart §8.1, JOURNAL 2026-10-08), chacune en français et en anglais (Écart §14,
// JOURNAL 2026-10-07).

import { defineTexts, localized } from "../locale/texts";

export const HINT_TEXTS = defineTexts({
  pinch: { fr: "Pince pour zoomer", en: "Pinch to zoom" },
  tapPixel: {
    fr: "Touche un pixel pour voir qui l'a posé",
    en: "Tap a pixel to see who placed it",
  },
  // Les points de la bulle, dits à voix haute : combien de gestes sur combien.
  progress: localized({
    fr: (done: number, total: number) => `${done} sur ${total}`,
    en: (done, total) => `${done} of ${total}`,
  }),
});
