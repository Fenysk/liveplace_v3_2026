// `/confidentialite` : « LivePlace » qui ramène à l'accueil, le titre et une ligne qui dit la page en chantier, en attendant le texte
// (JOURNAL 2026-09-27). Écart §9.1 (JOURNAL 2026-10-31) : le mot-symbole est un lien vers l'accueil, posé comme sur l'accueil.

import { useEffect } from "react";
import { NoticePill } from "../design/pill";
import { Wordmark } from "../design/wordmark";
import { useTexts } from "../locale/use-locale";
import { PRIVACY_TEXTS } from "./privacy-texts";

const HOME_PATH = "/";

export const PrivacyPage = () => {
  const t = useTexts(PRIVACY_TEXTS);
  // Le serveur écrit le titre de l'onglet ; un changement de langue sans recharger le réécrit ici (Écart §14).
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t]);
  return (
    <main className="lp-privacy">
      <div className="lp-privacy-top">
        <Wordmark href={HOME_PATH} />
      </div>
      <NoticePill title={t.title}>
        <p className="lp-type-body lp-muted lp-prompt">{t.underConstruction}</p>
      </NoticePill>
    </main>
  );
};
