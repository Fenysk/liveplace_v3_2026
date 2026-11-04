// Les sections des mentions légales, dans l'ordre de la page : la page les écrit et le sommaire les lit, depuis cette seule liste.

import type { DocumentSection } from "../document/document-sections";
import type { Locale } from "../locale/locale";
import type { LEGAL_TEXTS } from "./legal-texts";

export const legalSections = (t: (typeof LEGAL_TEXTS)[Locale]): readonly DocumentSection[] => [
  { id: "legal-publisher", title: t.publisherTitle, sentences: t.publisherSentences },
  { id: "legal-director", title: t.directorTitle, sentences: t.directorSentences },
  { id: "legal-host", title: t.hostTitle, sentences: t.hostSentences },
  { id: "legal-storage", title: t.storageTitle, sentences: t.storageSentences },
  { id: "legal-report", title: t.reportTitle, sentences: t.reportSentences },
  { id: "legal-data", title: t.dataTitle, sentences: t.dataSentences },
];
