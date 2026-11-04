// Les mots des mentions légales (§9.9) : leur titre, le titre de l'onglet, puis les 6 sections (CDC des textes du 2026-11-04). Les
// coordonnées d'Alexis viennent de legal-identity.ts, les mêmes dans les deux langues ; une phrase qui porte un lien a la forme de
// celles de la politique (privacy-texts.ts).

import type { Sentence } from "../document/document-sections";
import { defineTexts, localized } from "../locale/texts";
import { LEGAL_IDENTITY, PUBLISHER_NAME } from "./legal-identity";

export const LEGAL_TEXTS = defineTexts({
  title: { fr: "Mentions légales", en: "Legal notice" },
  documentTitle: { fr: "Mentions légales · LivePlace", en: "Legal notice · LivePlace" },

  publisherTitle: { fr: "L'éditeur", en: "Publisher" },
  publisherSentences: localized<Sentence[]>({
    fr: [
      `LivePlace est édité par ${PUBLISHER_NAME}, entrepreneur individuel.`,
      `SIRET : ${LEGAL_IDENTITY.siret}.`,
      `Discord : ${LEGAL_IDENTITY.discord}.`,
      ["E-mail : ", { link: "email" }, "."],
    ],
    en: [
      `LivePlace is published by ${PUBLISHER_NAME}, sole proprietor (entrepreneur individuel).`,
      `SIRET: ${LEGAL_IDENTITY.siret}.`,
      `Discord: ${LEGAL_IDENTITY.discord}.`,
      ["Email: ", { link: "email" }, "."],
    ],
  }),

  directorTitle: { fr: "Le directeur de la publication", en: "Publication director" },
  directorSentences: localized<Sentence[]>({
    fr: [`${PUBLISHER_NAME}.`],
    en: [`${PUBLISHER_NAME}.`],
  }),

  hostTitle: { fr: "L'hébergeur", en: "Host" },
  hostSentences: localized<Sentence[]>({
    fr: ["Contabo GmbH, Welfenstraße 22, 81541 Munich, Allemagne.", `Email : ${LEGAL_IDENTITY.hostEmail}.`],
    en: ["Contabo GmbH, Welfenstraße 22, 81541 Munich, Germany.", `Email: ${LEGAL_IDENTITY.hostEmail}.`],
  }),

  storageTitle: { fr: "Le stockage des données", en: "Data storage" },
  storageSentences: localized<Sentence[]>({
    fr: [
      "Convex, Inc., 444 De Haro Street, Suite 218, San Francisco, CA 94107, États-Unis.",
      "Les données sont stockées en Irlande.",
    ],
    en: [
      "Convex, Inc., 444 De Haro Street, Suite 218, San Francisco, CA 94107, United States.",
      "Data is stored in Ireland.",
    ],
  }),

  reportTitle: { fr: "Signaler un contenu", en: "Report content" },
  reportSentences: localized<Sentence[]>({
    fr: [
      [
        "Un dessin illicite ? Clique ",
        { chip: "report" },
        " dans l'",
        { chip: "inspection" },
        ", ou écris à ",
        { link: "email" },
        ".",
      ],
    ],
    en: [
      [
        "An illegal drawing? Click ",
        { chip: "report" },
        " in ",
        { chip: "inspection" },
        ", or write to ",
        { link: "email" },
        ".",
      ],
    ],
  }),

  dataTitle: { fr: "Tes données", en: "Your data" },
  dataSentences: localized<Sentence[]>({
    fr: [["Ce que LivePlace fait de tes données : ", { link: "privacy" }, "."]],
    en: [["What LivePlace does with your data: ", { link: "privacy" }, "."]],
  }),
});
