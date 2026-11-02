// `/confidentialite` : l'en-tête de l'accueil (« LivePlace », un lien vers l'accueil, et les réglages), le titre en grand, puis dans une carte
// la ligne qui dit la page en chantier (JOURNAL 2026-09-27) et les sections de privacy-sections.ts (CDC §8). Au PC, un sommaire collant
// à gauche suit la section lue ; sous 1100 px de bloc, une colonne sans sommaire (JOURNAL 2026-11-02). §9.10 : le mot-symbole est
// un lien vers l'accueil, posé comme sur l'accueil.

import { useEffect } from "react";
import { Wordmark } from "../design/wordmark";
import { HomeSettings } from "../home/home-settings";
import { useTexts } from "../locale/use-locale";
import { PRIVACY_END_ID, type PrivacySection, privacySections } from "./privacy-sections";
import { PRIVACY_TEXTS } from "./privacy-texts";
import { useCurrentSection } from "./use-current-section";

const HOME_PATH = "/";

type ContentsProps = { label: string; sections: readonly PrivacySection[]; currentId: string };

const Contents = ({ label, sections, currentId }: ContentsProps) => (
  <nav className="lp-privacy-nav" aria-label={label}>
    <ol className="lp-privacy-contents">
      {sections.map(({ id, title }) => (
        <li key={id}>
          <a
            className="lp-privacy-link lp-type-body"
            href={`#${id}`}
            aria-current={id === currentId ? "location" : undefined}
          >
            {title}
          </a>
        </li>
      ))}
    </ol>
  </nav>
);

// Le lien dans le texte est celui de la fenêtre Supprimer mon compte (window.css)
const Section = ({ id, title, sentences, contact }: PrivacySection) => (
  <section id={id} aria-labelledby={`${id}-title`} className="lp-privacy-section">
    <h2 id={`${id}-title`} className="lp-type-title">
      {title}
    </h2>
    {sentences.map((sentence) => (
      <p key={sentence} className="lp-type-body">
        {sentence}
      </p>
    ))}
    {contact && (
      <p className="lp-type-body">
        {contact.before}
        <a className="lp-window-link" href={`mailto:${contact.address}`}>
          {contact.address}
        </a>
        {contact.after}
      </p>
    )}
  </section>
);

export const PrivacyPage = () => {
  const t = useTexts(PRIVACY_TEXTS);
  const sections = privacySections(t);
  const currentId = useCurrentSection(
    sections.map(({ id }) => id),
    PRIVACY_END_ID,
  );
  // Le serveur écrit le titre de l'onglet ; un changement de langue sans recharger le réécrit ici (§9.9).
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t]);
  return (
    <main className="lp-home-page">
      <div className="lp-void" aria-hidden="true" />
      <div className="lp-home">
        <div className="lp-home-header">
          <Wordmark href={HOME_PATH} />
          <HomeSettings />
        </div>
        <div className="lp-privacy-doc">
          <Contents label={t.contentsLabel} sections={sections} currentId={currentId} />
          <div className="lp-privacy-column">
            <h1 className="lp-type-display">{t.title}</h1>
            <div className="lp-pill lp-privacy-card">
              <p className="lp-type-body lp-muted">{t.underConstruction}</p>
              {sections.map((section) => (
                <Section key={section.id} {...section} />
              ))}
            </div>
          </div>
          <div id={PRIVACY_END_ID} className="lp-privacy-end" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
};
