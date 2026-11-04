// `/confidentialite` : le document (document-page.tsx) de la politique. Les deux lignes en tête de la carte disent ce que la page
// contient et sa date ; les 14 sections sont celles de privacy-sections.ts (CDC §8, textes du 2026-11-04). Au bas, le lien vers les
// mentions légales.

import { DocumentPage } from "../document/document-page";
import { useLocale, useTexts } from "../locale/use-locale";
import { formatPrivacyDate } from "./privacy-date";
import { privacySections } from "./privacy-sections";
import { PRIVACY_TEXTS } from "./privacy-texts";

export const PrivacyPage = () => {
  const t = useTexts(PRIVACY_TEXTS);
  const locale = useLocale();
  return (
    <DocumentPage
      title={t.title}
      documentTitle={t.documentTitle}
      intro={[t.intro, t.updated(formatPrivacyDate(locale))]}
      sections={privacySections(t)}
      otherName="legal"
    />
  );
};
