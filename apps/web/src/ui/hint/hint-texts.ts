// Les phrases du conseil de première visite (Écart §8.1, JOURNAL 2026-10-08), chacune en français et en anglais (Écart §14,
// JOURNAL 2026-10-07).

import { defineTexts, localized } from "../locale/texts";

export const HINT_TEXTS = defineTexts({
  pinch: { fr: "Pince pour zoomer", en: "Pinch to zoom" },
  // Écart §8.1 (JOURNAL 2026-10-31) : le premier toucher zoome une case trop petite (`tapZoomTarget`), le second montre l'auteur.
  tapPixel: {
    fr: "Touche un pixel, puis encore une fois pour voir qui l'a posé",
    en: "Tap a pixel, then tap it again to see who placed it",
  },
  // À la souris (Écart §8.1, JOURNAL 2026-10-12) : les mêmes deux gestes, à la molette et au clic.
  scroll: { fr: "Molette pour zoomer", en: "Scroll to zoom" },
  clickPixel: {
    fr: "Clique sur un pixel pour voir qui l'a posé",
    en: "Click a pixel to see who placed it",
  },
  // Les points de la bulle, dits à voix haute : combien de gestes sur combien.
  progress: localized({
    fr: (done: number, total: number) => `${done} sur ${total}`,
    en: (done, total) => `${done} of ${total}`,
  }),
});
