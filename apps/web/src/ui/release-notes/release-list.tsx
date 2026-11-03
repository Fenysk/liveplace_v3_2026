// Les publications des Nouveautés, la plus récente en haut : sa date seule pour titre (« 1er novembre »), puis un groupe par public visible :
// ce qui s'adresse à tous d'abord, sans titre, puis « Pour les modérateurs » et « Pour les streamers », dans cet ordre. Une ligne : le titre,
// la phrase dessous, la vignette à droite quand il y en a une. Des lignes sous un filet, jamais des cartes encadrées. Un seul public visible
// n'a pas de titre de groupe.
// `isGrid` (la page `/nouveautes`) : chaque nouveauté est une carte, la vignette en haut puis le texte dessous ; au PC, les cartes d'un
// groupe se rangent en 2 colonnes dès 760 px de bloc, 3 dès 1100 px (release-notes.css).

import type { ReactNode } from "react";
import { useLocale, useTexts } from "../locale/use-locale";
import {
  formatReleaseDate,
  type Release,
  type ReleaseAudience,
  type ReleaseLine,
  type ShownRelease,
  shownReleases,
  thumbnailOrders,
} from "./release-notes";
import { RELEASE_NOTES_TEXTS, RELEASES } from "./release-notes-texts";
import { ReleaseShot } from "./release-shot";

// Le niveau du titre de la publication : 3 sous le titre de la fenêtre, 2 sous celui de la page ; les groupes sont un niveau plus bas.
type HeadingLevel = 2 | 3;

const Heading = ({
  level,
  className,
  children,
}: {
  level: number;
  className: string;
  children: ReactNode;
}) => {
  const Tag = `h${level}` as "h2" | "h3" | "h4";
  return <Tag className={className}>{children}</Tag>;
};

// L'ordre de lecture des vignettes de la liste (thumbnailOrders) : il décale leurs boucles.
type ThumbnailOrders = ReadonlyMap<ReleaseLine, number>;

// Une ligne de la fenêtre : le texte, puis la vignette à droite. Une carte de la page : la vignette dans sa cellule, puis le texte.
const Line = ({ line, isGrid, orders }: { line: ReleaseLine; isGrid: boolean; orders: ThumbnailOrders }) => {
  const locale = useLocale();
  const { title, sentence } = line.texts[locale];
  const shot = line.thumbnail && (
    <ReleaseShot kind={line.thumbnail} title={title} order={orders.get(line) ?? 0} />
  );
  const text = (
    <div className="lp-release-text">
      <p className="lp-type-body">{title}</p>
      <p className="lp-type-caption lp-muted">{sentence}</p>
    </div>
  );
  if (!isGrid)
    return (
      <li className="lp-release-line">
        {text}
        {shot}
      </li>
    );
  return (
    <li className="lp-release-line lp-release-entry">
      {shot && <div className="lp-release-shot-cell">{shot}</div>}
      {text}
    </li>
  );
};

type ReleaseArticleProps = {
  release: ShownRelease;
  level: HeadingLevel;
  hasAudienceTitles: boolean;
  isGrid: boolean;
  orders: ThumbnailOrders;
};

const ReleaseArticle = ({ release, level, hasAudienceTitles, isGrid, orders }: ReleaseArticleProps) => {
  const locale = useLocale();
  const t = useTexts(RELEASE_NOTES_TEXTS);
  return (
    <article className="lp-release">
      <Heading level={level} className={isGrid ? "lp-type-heading" : "lp-type-title"}>
        {formatReleaseDate(release.date, locale)}
      </Heading>
      {release.byAudience.map(({ audience, lines }) => {
        // Ce qui s'adresse à tous n'a pas de titre ; sans titre, un groupe n'est qu'une division : une section se nomme.
        const title = hasAudienceTitles && audience !== "viewer" ? t.audienceTitles[audience] : undefined;
        const Container = title ? "section" : "div";
        return (
          <Container key={audience} className="lp-release-audience">
            {title && (
              <Heading level={level + 1} className={isGrid ? "lp-type-title" : "lp-type-caption lp-muted"}>
                {title}
              </Heading>
            )}
            <ul className="lp-release-lines">
              {lines.map((line) => (
                <Line key={line.texts.fr.title} line={line} isGrid={isGrid} orders={orders} />
              ))}
            </ul>
          </Container>
        );
      })}
    </article>
  );
};

type ReleaseListProps = {
  audiences: readonly ReleaseAudience[];
  level: HeadingLevel;
  releases?: readonly Release[];
  isGrid?: boolean;
};

export const ReleaseList = ({ audiences, level, releases = RELEASES, isGrid = false }: ReleaseListProps) => {
  const shown = shownReleases(releases, audiences);
  const orders = thumbnailOrders(shown);
  return (
    <div className={isGrid ? "lp-releases lp-releases--grid" : "lp-releases"}>
      {shown.map((release) => (
        <ReleaseArticle
          key={release.date}
          release={release}
          level={level}
          hasAudienceTitles={audiences.length > 1}
          isGrid={isGrid}
          orders={orders}
        />
      ))}
    </div>
  );
};
