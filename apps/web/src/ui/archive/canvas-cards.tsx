// Les lignes de la section « Archives » de la fenêtre (Écart §15, JOURNAL 2026-10-06) : le canvas en cours en haut,
// puis les archives de la plus récente à la plus ancienne. L'affichage seul, nourri par `ArchivesTab`.

import { MAX_ARCHIVES, PALETTE } from "@liveplace/domain";
import { fromBase64 } from "@liveplace/shared";
import { Archive, ArchiveRestore, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { ListedArchive, ListedCanvas, ListedCanvases } from "../../usecase/list-canvases";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { PixelPreview } from "../design/pixel-preview";
import { WindowRow } from "../design/window";
import { useLocale, useTexts } from "../locale/use-locale";
import {
  ARCHIVE_TEXTS,
  archiveCaption,
  archiveHref,
  canvasTitle,
  currentCanvasCaption,
  currentCanvasTitle,
} from "./archive-texts";
import { toThumbnailPixels } from "./thumbnail-pixels";

// `isDecorative` : la miniature est dans un lien dont le texte la nomme déjà, un lecteur d'écran la passe.
type CanvasThumbnailProps = { canvas: ListedCanvas; label: string; isDecorative?: boolean };

const CanvasThumbnail = ({ canvas, label, isDecorative = false }: CanvasThumbnailProps) => {
  const t = useTexts(ARCHIVE_TEXTS);
  const { thumbnail } = canvas;
  const pixels = useMemo(
    () => (thumbnail ? toThumbnailPixels(fromBase64(thumbnail.state), thumbnail.width) : []),
    [thumbnail],
  );
  // Redis n'a plus l'image : le damier à sa place, pour que la ligne garde sa forme.
  if (!thumbnail)
    return (
      <div
        className="lp-canvas-thumb lp-canvas-thumb--empty"
        role="img"
        aria-label={t.unavailable(label)}
        aria-hidden={isDecorative ? true : undefined}
      />
    );
  return (
    <div className="lp-canvas-thumb" aria-hidden={isDecorative ? true : undefined}>
      <PixelPreview
        width={thumbnail.width}
        height={thumbnail.height}
        palette={PALETTE}
        pixels={pixels}
        label={label}
      />
    </div>
  );
};

// Le titre et sa légende ; `hasOpenIcon` : l'icône d'ouverture, juste après le titre, pour la ligne qui est un lien.
type CanvasTextProps = { title: string; caption: string | null; hasOpenIcon?: boolean };

const CanvasText = ({ title, caption, hasOpenIcon = false }: CanvasTextProps) => (
  <span className="lp-canvas-text">
    <span className="lp-canvas-title lp-type-title">
      {title}
      {hasOpenIcon && <ExternalLink className="lp-canvas-open" aria-hidden="true" />}
    </span>
    {caption && <span className="lp-type-caption lp-muted">{caption}</span>}
  </span>
);

type ActiveCanvasRowProps = {
  canvas: ListedCanvas;
  isArchiveFull: boolean; // cinq archives : archiver est inactif, et dit de supprimer une archive d'abord
  onArchive: () => void;
};

export const ActiveCanvasRow = ({ canvas, isArchiveFull, onArchive }: ActiveCanvasRowProps) => {
  const locale = useLocale();
  const t = useTexts(ARCHIVE_TEXTS);
  return (
    <>
      <WindowRow
        hasProfile
        isListed
        label={
          <span className="lp-canvas-id">
            <CanvasThumbnail canvas={canvas} label={t.currentThumbnail} />
            <CanvasText
              title={currentCanvasTitle(canvas, locale)}
              caption={currentCanvasCaption(canvas, locale)}
            />
          </span>
        }
      >
        <Button
          icon={Archive}
          label={t.archiveAction}
          variant="primary"
          isDisabled={isArchiveFull}
          onPress={onArchive}
        />
      </WindowRow>
      {isArchiveFull && <p className="lp-type-caption lp-muted">{t.switchFailure("archives_full")}</p>}
    </>
  );
};

type ArchiveRowProps = {
  archive: ListedArchive;
  login: string;
  onCopyLink: () => void;
  onReopen: () => void;
  onDiscard: () => void;
};

// La miniature et le titre ne font qu'un lien, qui ouvre l'archive dans un nouvel onglet. Rouvrir est le seul bouton
// écrit : copier le lien et supprimer n'ont que leur icône, dans la variante la plus sobre.
export const ArchiveRow = ({ archive, login, onCopyLink, onReopen, onDiscard }: ArchiveRowProps) => {
  const locale = useLocale();
  const t = useTexts(ARCHIVE_TEXTS);
  const title = canvasTitle(archive, locale);
  return (
    <li>
      <WindowRow
        hasProfile
        isListed
        label={
          <a
            className="lp-canvas-id lp-canvas-link"
            href={archiveHref(login, archive.linkCode)}
            title={t.viewArchive}
            aria-label={t.openArchive(title)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CanvasThumbnail canvas={archive} label={t.archiveThumbnail(title)} isDecorative />
            <CanvasText title={title} caption={archiveCaption(archive, locale)} hasOpenIcon />
          </a>
        }
      >
        <div className="lp-row">
          <Button icon={ArchiveRestore} label={t.reopen} onPress={onReopen} />
          <Button icon={Link2} variant="ghost" title={t.copyLink} onPress={onCopyLink} />
          <Button icon={Trash2} variant="ghost" title={t.discard} onPress={onDiscard} />
        </div>
      </WindowRow>
    </li>
  );
};

export type ArchivesList =
  | { status: "loading" }
  | { status: "ready"; canvases: ListedCanvases }
  | { status: "failed" };

type ArchivesSectionProps = {
  list: ArchivesList;
  login: string;
  onArchive: () => void;
  onCopyLink: (archive: ListedArchive) => void;
  onReopen: (archive: ListedArchive) => void;
  onDiscard: (archive: ListedArchive) => void;
  onRetry: () => void;
};

export const ArchivesSection = ({
  list,
  login,
  onArchive,
  onCopyLink,
  onReopen,
  onDiscard,
  onRetry,
}: ArchivesSectionProps) => {
  const t = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">{design.loading}</span>;
  if (list.status === "failed")
    return (
      <div className="lp-setting">
        <span className="lp-type-caption lp-danger">{t.canvasesUnavailable}</span>
        <div className="lp-row">
          <Button label={t.retry} onPress={onRetry} />
        </div>
      </div>
    );
  const { active, archives } = list.canvases;
  return (
    <>
      <div className="lp-setting">
        <span className="lp-type-body">{t.currentCanvasLabel}</span>
        {active ? (
          <ActiveCanvasRow
            canvas={active}
            isArchiveFull={archives.length >= MAX_ARCHIVES}
            onArchive={onArchive}
          />
        ) : (
          <p className="lp-type-caption lp-muted">{t.noCurrentCanvas}</p>
        )}
      </div>
      <div className="lp-setting">
        <span className="lp-type-body">
          {t.archivesCounter({ count: archives.length, max: MAX_ARCHIVES })}
        </span>
        {archives.length === 0 ? (
          <p className="lp-type-caption lp-muted">{t.noArchive}</p>
        ) : (
          <ul className="lp-canvas-list">
            {archives.map((archive) => (
              <ArchiveRow
                key={archive.canvasId}
                archive={archive}
                login={login}
                onCopyLink={() => onCopyLink(archive)}
                onReopen={() => onReopen(archive)}
                onDiscard={() => onDiscard(archive)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
