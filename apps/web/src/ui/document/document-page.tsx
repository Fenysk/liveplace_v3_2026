// Un document (`/confidentialite`, `/mentions-legales`) : l'en-tête de l'accueil (« LivePlace », un lien vers l'accueil, et les réglages),
// le titre en grand, puis dans une carte les lignes d'en-tête éventuelles et les sections (CDC §8). Au PC, un sommaire collant à
// gauche suit la section lue ; sous 1100 px de bloc, une colonne sans sommaire (JOURNAL 2026-11-02). §9.10 : le mot-symbole est un
// lien vers l'accueil, posé comme sur l'accueil. Au bas, le lien vers l'autre document.

import { useEffect } from "react";
import { Chip } from "../design/chip";
import { Wordmark } from "../design/wordmark";
import { HomeSettings } from "../home/home-settings";
import { useLocale, useTexts } from "../locale/use-locale";
import { type SentenceChip, sentenceChips } from "./document-chips";
import { DocumentLinks } from "./document-links";
import {
  type ChipName,
  DOCUMENT_END_ID,
  type DocumentName,
  type DocumentSection,
  type LinkName,
  type Sentence,
  type SentenceLink,
  type SentencePart,
  sentenceLinks,
} from "./document-sections";
import { DOCUMENT_TEXTS } from "./document-texts";
import { useCurrentSection } from "./use-current-section";

const HOME_PATH = "/";

type ContentsProps = { label: string; sections: readonly DocumentSection[]; currentId: string };

const Contents = ({ label, sections, currentId }: ContentsProps) => (
  <nav className="lp-doc-nav" aria-label={label}>
    <ol className="lp-doc-contents">
      {sections.map(({ id, title }) => (
        <li key={id}>
          <a
            className="lp-doc-link lp-type-body"
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

// Un lien dans une phrase est celui de la fenêtre Supprimer mon compte (window.css) ; hors de LivePlace, il s'ouvre dans un nouvel onglet
const InlineLink = ({ text, href, isExternal }: SentenceLink) => (
  <a
    className="lp-window-link"
    href={href}
    {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {text}
  </a>
);

const partKey = (part: SentencePart): string => {
  if (typeof part === "string") return part;
  return "link" in part ? `link:${part.link}` : `chip:${part.chip}`;
};

const sentenceKey = (sentence: Sentence): string =>
  typeof sentence === "string" ? sentence : sentence.map(partKey).join("");

type Words = { links: Record<LinkName, SentenceLink>; chips: Record<ChipName, SentenceChip> };

const Part = ({ part, links, chips }: Words & { part: SentencePart }) => {
  if (typeof part === "string") return part;
  return "link" in part ? <InlineLink {...links[part.link]} /> : <Chip {...chips[part.chip]} />;
};

const Paragraph = ({ sentence, ...words }: Words & { sentence: Sentence }) => (
  <p className="lp-type-body">
    {(typeof sentence === "string" ? [sentence] : sentence).map((part) => (
      <Part key={partKey(part)} part={part} {...words} />
    ))}
  </p>
);

type SectionProps = DocumentSection & Words;

const Section = ({ id, title, sentences, ...words }: SectionProps) => (
  <section id={id} aria-labelledby={`${id}-title`} className="lp-doc-section">
    <h2 id={`${id}-title`} className="lp-type-title">
      {title}
    </h2>
    {sentences.map((sentence) => (
      <Paragraph key={sentenceKey(sentence)} sentence={sentence} {...words} />
    ))}
  </section>
);

type DocumentPageProps = {
  title: string;
  documentTitle: string;
  intro?: readonly string[]; // les lignes en tête de la carte, avant la première section
  sections: readonly DocumentSection[];
  otherName: DocumentName; // l'autre document, vers lequel le bas de la page mène
};

export const DocumentPage = ({
  title,
  documentTitle,
  intro = [],
  sections,
  otherName,
}: DocumentPageProps) => {
  const t = useTexts(DOCUMENT_TEXTS);
  const words: Words = { links: sentenceLinks(t), chips: sentenceChips(useLocale()) };
  const currentId = useCurrentSection(
    sections.map(({ id }) => id),
    DOCUMENT_END_ID,
  );
  // Le serveur écrit le titre de l'onglet ; un changement de langue sans recharger le réécrit ici (§9.9).
  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);
  return (
    <main className="lp-home-page">
      <div className="lp-void" aria-hidden="true" />
      <div className="lp-home">
        <div className="lp-home-header">
          <Wordmark href={HOME_PATH} />
          <HomeSettings />
        </div>
        <div className="lp-doc">
          <Contents label={t.contentsLabel} sections={sections} currentId={currentId} />
          <div className="lp-doc-column">
            <h1 className="lp-type-display">{title}</h1>
            <div className="lp-pill lp-doc-card">
              {intro.length > 0 && (
                <div className="lp-doc-intro">
                  {intro.map((line) => (
                    <p key={line} className="lp-type-body lp-muted">
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {sections.map((section) => (
                <Section key={section.id} {...section} {...words} />
              ))}
            </div>
            <DocumentLinks names={[otherName]} />
          </div>
          <div id={DOCUMENT_END_ID} className="lp-doc-end" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
};
