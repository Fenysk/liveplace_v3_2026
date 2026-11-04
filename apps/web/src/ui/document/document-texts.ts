// Les mots communs aux documents (§9.9) : le nom du sommaire, les mots d'un lien vers l'autre page dans une phrase, et ceux des
// deux liens discrets (accueil, Mon compte, bas de chaque document).

import { defineTexts } from "../locale/texts";

export const DOCUMENT_TEXTS = defineTexts({
  contentsLabel: { fr: "Sommaire", en: "Contents" },
  privacyPolicyWords: { fr: "la politique de confidentialité", en: "the privacy policy" },
  legalNoticeWords: { fr: "les mentions légales", en: "the legal notice" },
  privacyLink: { fr: "Confidentialité", en: "Privacy" },
  legalLink: { fr: "Mentions légales", en: "Legal notice" },
});
