// Les phrases du design system (Écart §14, JOURNAL 2026-10-07) : celles que ses composants écrivent eux-mêmes.

import { defineTexts } from "../locale/texts";

export const DESIGN_TEXTS = defineTexts({
  language: { fr: "Langue", en: "Language" },
  // Le titre du bouton de langue dit l'action : passer dans l'autre langue, nommée dans la langue de la page.
  switchTo: {
    fr: { fr: "Passer en français", en: "Passer en anglais" },
    en: { fr: "Switch to French", en: "Switch to English" },
  },
});
