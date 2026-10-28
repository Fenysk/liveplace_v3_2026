// Les phrases que `/` donne aux moteurs de recherche et aux cartes de partage (Écart §9.1, JOURNAL 2026-10-22) : titre, description
// et texte de l'image. Elles ne s'affichent pas dans la page. Un robot sans cookie ni `Accept-Language` reçoit l'anglais (JOURNAL 2026-10-28).

import { defineTexts } from "../locale/texts";

export const HOME_HEAD_TEXTS = defineTexts({
  title: {
    fr: "LivePlace · Une fresque de pixels pour ton stream Twitch",
    en: "LivePlace · A pixel canvas for your Twitch stream",
  },
  description: {
    fr: "Une fresque de pixels collaborative pour ton stream Twitch : tes viewers dessinent depuis leur téléphone ou leur PC, et la fresque s'affiche sur ton stream avec OBS.",
    en: "A collaborative pixel canvas for your Twitch stream: your viewers draw from their phone or PC, and the canvas shows on your stream with OBS.",
  },
  imageAlt: {
    fr: "Le téléphone d'un viewer et la fresque sur un stream, avec un cœur, un soleil et de l'herbe dessinés.",
    en: "A viewer's phone and the canvas on a stream, with a heart, a sun and grass drawn on it.",
  },
});
