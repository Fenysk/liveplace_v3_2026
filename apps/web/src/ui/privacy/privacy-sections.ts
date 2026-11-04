// Les sections de la politique, dans l'ordre de la page : la page les écrit et le sommaire les lit, depuis cette seule liste. Une
// section de plus est une entrée ici (son titre et ses phrases dans privacy-texts.ts) : ni la page ni le sommaire ne changent.

import type { DocumentSection } from "../document/document-sections";
import type { Locale } from "../locale/locale";
import type { PRIVACY_TEXTS } from "./privacy-texts";

export const privacySections = (t: (typeof PRIVACY_TEXTS)[Locale]): readonly DocumentSection[] => [
  { id: "privacy-who", title: t.whoTitle, sentences: t.whoSentences },
  { id: "privacy-account", title: t.accountTitle, sentences: t.accountSentences },
  { id: "privacy-streamer", title: t.ownerTitle, sentences: t.ownerSentences },
  { id: "privacy-drawings", title: t.drawingsTitle, sentences: t.drawingsSentences },
  { id: "privacy-moderation", title: t.moderationTitle, sentences: t.moderationSentences },
  { id: "privacy-backups", title: t.snapshotsTitle, sentences: t.snapshotsSentences },
  { id: "privacy-delete-account", title: t.deleteAccountTitle, sentences: t.deleteAccountSentences },
  { id: "privacy-donations", title: t.donationsTitle, sentences: t.donationsSentences },
  { id: "privacy-audience", title: t.audienceTitle, sentences: t.audienceSentences },
  { id: "privacy-browser", title: t.browserTitle, sentences: t.browserSentences },
  { id: "privacy-logs", title: t.logsTitle, sentences: t.logsSentences },
  { id: "privacy-services", title: t.servicesTitle, sentences: t.servicesSentences },
  { id: "privacy-legal-basis", title: t.legalBasisTitle, sentences: t.legalBasisSentences },
  { id: "privacy-rights", title: t.rightsTitle, sentences: t.rightsSentences },
];
