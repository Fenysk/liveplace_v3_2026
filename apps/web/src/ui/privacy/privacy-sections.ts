// Les sections de la politique : la page les écrit et le sommaire les lit, depuis cette seule liste. Une section de plus est une
// entrée ici (son titre et ses phrases dans privacy-texts.ts) : ni la page ni le sommaire ne changent.

import type { Locale } from "../locale/locale";
import type { PRIVACY_TEXTS } from "./privacy-texts";

// La ligne de contact : l'adresse est un lien, les mots avant et après elle sont traduits
export type PrivacyContact = { before: string; address: string; after: string };

export type PrivacySection = {
  id: string;
  title: string;
  sentences: readonly string[];
  contact?: PrivacyContact;
};

// L'adresse de contact, pour qui ne peut pas se connecter : écrite telle quelle dans les deux langues
export const CONTACT_ADDRESS = "fenysk.pro@gmail.com";

// Le repère posé au bas du document : le sommaire sait que le visiteur a atteint la fin (use-current-section.ts)
export const PRIVACY_END_ID = "privacy-end";

export const privacySections = (t: (typeof PRIVACY_TEXTS)[Locale]): readonly PrivacySection[] => [
  {
    id: "privacy-delete-account",
    title: t.deleteAccountTitle,
    sentences: t.deleteAccountSentences,
    contact: { ...t.deleteAccountContact, address: CONTACT_ADDRESS },
  },
];
