// Ce qu'un document écrit (la politique de confidentialité, les mentions légales) : la page écrit ses sections et le sommaire les lit,
// depuis cette seule liste. Une section de plus est une entrée de la liste du document, ni la page ni le sommaire ne changent.

import type { Locale } from "../locale/locale";
import type { DOCUMENT_TEXTS } from "./document-texts";

// Les deux pages du site qui sont des documents, et leur adresse
export type DocumentName = "privacy" | "legal";

export const DOCUMENT_PATHS: Record<DocumentName, string> = {
  privacy: "/confidentialite",
  legal: "/mentions-legales",
};

// L'adresse de contact : écrite telle quelle dans les deux langues
export const CONTACT_ADDRESS = "fenysk.pro@gmail.com";

const CNIL_ADDRESS = "cnil.fr";

// Là où mène un lien dans une phrase : une adresse e-mail, une des deux pages, la CNIL
export type LinkName = "email" | "privacy" | "legal" | "cnil";

// Les six éléments d'interface qu'une phrase cite : Mon compte, Supprimer mon compte, Signaler, Synchroniser avec Twitch, la pill Inspection,
// le Classement. Leur nom, leur icône et leur couleur sont dans document-chips.ts.
export type ChipName =
  | "myAccount"
  | "deleteAccount"
  | "report"
  | "syncWithTwitch"
  | "inspection"
  | "scoreboard";

// Une phrase est un texte seul, ou une liste de morceaux dans l'ordre où elle se lit : des mots, un lien, une pastille. Le nom d'un lien ou
// d'une pastille est le même dans les deux langues (le test des textes) ; sa cible, ou son nom affiché, son icône et sa couleur, viennent du code.
export type SentencePart = string | { link: LinkName } | { chip: ChipName };

export type Sentence = string | readonly SentencePart[];

export type DocumentSection = { id: string; title: string; sentences: readonly Sentence[] };

// Un lien rendu : ses mots, où il mène, et s'il quitte LivePlace (un nouvel onglet)
export type SentenceLink = { text: string; href: string; isExternal: boolean };

// Les mots d'une adresse e-mail ou de la CNIL ne se traduisent pas ; ceux d'une page viennent des textes
export const sentenceLinks = (words: (typeof DOCUMENT_TEXTS)[Locale]): Record<LinkName, SentenceLink> => ({
  email: { text: CONTACT_ADDRESS, href: `mailto:${CONTACT_ADDRESS}`, isExternal: false },
  privacy: { text: words.privacyPolicyWords, href: DOCUMENT_PATHS.privacy, isExternal: false },
  legal: { text: words.legalNoticeWords, href: DOCUMENT_PATHS.legal, isExternal: false },
  cnil: { text: CNIL_ADDRESS, href: `https://www.${CNIL_ADDRESS}`, isExternal: true },
});

// Le repère posé au bas du document : le sommaire sait que le visiteur a atteint la fin (use-current-section.ts)
export const DOCUMENT_END_ID = "document-end";
