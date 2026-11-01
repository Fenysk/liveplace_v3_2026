// Les mots de la page Confidentialité (§9.9) : son titre, la ligne qui la dit en chantier, et le titre de l'onglet.

import { defineTexts } from "../locale/texts";

export const PRIVACY_TEXTS = defineTexts({
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  underConstruction: {
    fr: "Notre politique de confidentialité est tellement confidentielle qu'on ne l'a pas encore écrite.",
    en: "Our privacy policy is so private we haven't even written it yet.",
  },
  documentTitle: { fr: "Confidentialité · LivePlace", en: "Privacy · LivePlace" },
});
