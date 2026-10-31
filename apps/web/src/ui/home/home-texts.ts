// Les phrases de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : une phrase, le bouton, et le nom de la fresque de la démo pour les
// lecteurs d'écran. Le bouton d'envoi de la démo écrit « Dessiner · n » avec le mot du jeu (`enterLabel`), et le stream n'écrit rien.

import { defineTexts } from "../locale/texts";

export const HOME_TEXTS = defineTexts({
  headline: { fr: "Tes viewers dessinent sur ton stream.", en: "Your viewers draw on your stream." },
  start: { fr: "Lancer ma fresque avec Twitch", en: "Start my canvas with Twitch" },
  demoCanvas: { fr: "Fresque de la démo", en: "Demo canvas" },
});
