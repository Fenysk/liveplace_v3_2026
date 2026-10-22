// `/confidentialite` : le titre et une ligne qui dit la page en chantier, en attendant le texte (JOURNAL 2026-09-27).

import { useEffect } from "react";
import { NoticePill } from "../design/pill";
import { useTexts } from "../locale/use-locale";
import { PRIVACY_TEXTS } from "./privacy-texts";

export const PrivacyPage = () => {
  const t = useTexts(PRIVACY_TEXTS);
  // Le serveur écrit le titre de l'onglet ; un changement de langue sans recharger le réécrit ici (Écart §14).
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t]);
  return (
    <main>
      <NoticePill title={t.title}>
        <p className="lp-type-body lp-muted lp-prompt">{t.underConstruction}</p>
      </NoticePill>
    </main>
  );
};
