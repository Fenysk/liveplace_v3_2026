// `/mentions-legales` : le document (document-page.tsx) des mentions légales, sans ligne en tête de carte. Au bas, le lien vers la
// politique de confidentialité.

import { DocumentPage } from "../document/document-page";
import { useTexts } from "../locale/use-locale";
import { legalSections } from "./legal-sections";
import { LEGAL_TEXTS } from "./legal-texts";

export const LegalPage = () => {
  const t = useTexts(LEGAL_TEXTS);
  return (
    <DocumentPage
      title={t.title}
      documentTitle={t.documentTitle}
      sections={legalSections(t)}
      otherName="privacy"
    />
  );
};
