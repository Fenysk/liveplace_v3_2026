// Les liens discrets vers un document : une ligne dans le style de celle sous Se connecter (twitch.css), sous l'accueil, dans Mon compte
// et au bas de chaque document. Le lien s'ouvre dans l'onglet de la page : le brouillon survit dans `localStorage` (§9.10).

import { Fragment } from "react";
import { useTexts } from "../locale/use-locale";
import { DOCUMENT_PATHS, type DocumentName } from "./document-sections";
import { DOCUMENT_TEXTS } from "./document-texts";

export const DocumentLinks = ({ names }: { names: readonly DocumentName[] }) => {
  const t = useTexts(DOCUMENT_TEXTS);
  const labels: Record<DocumentName, string> = { privacy: t.privacyLink, legal: t.legalLink };
  return (
    <p className="lp-sign-in-note lp-type-caption lp-muted">
      {names.map((name, index) => (
        <Fragment key={name}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <a href={DOCUMENT_PATHS[name]}>{labels[name]}</a>
        </Fragment>
      ))}
    </p>
  );
};
