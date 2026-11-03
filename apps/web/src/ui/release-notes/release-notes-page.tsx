// `/nouveautes` : l'en-tête de l'accueil (le mot-symbole, qui ramène à l'accueil, et les réglages), le titre en grand, une phrase qui dit
// ce qu'on y lit, puis une colonne avec toutes les publications : ce qui s'adresse à tous d'abord, sans titre, puis les groupes titrés Pour les modérateurs
// et Pour les streamers. Chaque nouveauté est une
// carte : la vignette en haut (elle s'agrandit au clic), le titre et la phrase dessous. Au PC, la colonne va jusqu'à 1200 px et les cartes
// d'un groupe se rangent en 2 colonnes dès 760 px de bloc, 3 dès 1100 px ; sous 760 px, une colonne de 600 px au plus, les cartes l'une
// sous l'autre. Ouvrir la page marque tout comme lu, pour tous les publics.

import { useEffect } from "react";
import { Wordmark } from "../design/wordmark";
import { HomeSettings } from "../home/home-settings";
import { useTexts } from "../locale/use-locale";
import { ReleaseList } from "./release-list";
import { AUDIENCES } from "./release-notes";
import { RELEASE_NOTES_TEXTS } from "./release-notes-texts";
import { useMarkReleasesRead } from "./use-release-notes";

const HOME_PATH = "/";

export const ReleaseNotesPage = () => {
  const t = useTexts(RELEASE_NOTES_TEXTS);
  // Le serveur écrit le titre de l'onglet ; un changement de langue sans recharger le réécrit ici (§9.9).
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t]);
  useMarkReleasesRead(AUDIENCES, true);
  return (
    <main className="lp-home-page">
      <div className="lp-void" aria-hidden="true" />
      <div className="lp-home">
        <div className="lp-home-header">
          <Wordmark href={HOME_PATH} />
          <HomeSettings hasReleaseNotesLink={false} />
        </div>
        <div className="lp-release-column">
          <h1 className="lp-type-display">{t.title}</h1>
          <p className="lp-release-intro lp-type-body lp-muted">{t.intro}</p>
          <div className="lp-pill lp-release-card">
            <ReleaseList audiences={AUDIENCES} level={2} isGrid />
          </div>
        </div>
      </div>
    </main>
  );
};
