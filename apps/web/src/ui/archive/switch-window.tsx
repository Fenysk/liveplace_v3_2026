// Les fenêtres de confirmation de la section « Archives » (Écart §15, JOURNAL 2026-10-06) : la même pour Archiver et
// Rouvrir, qui dit ce qui va se passer et pose le choix des jauges ; une petite à part pour Supprimer.
// Rien ne se fait avant que le streamer confirme, et la fenêtre se verrouille pendant l'action.

import { ARCHIVE_NAME_MAX_LENGTH } from "@liveplace/domain";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ListedArchive, ListedCanvas } from "../../usecase/list-canvases";
import { Button } from "../design/button";
import { ChoiceList } from "../design/choice-list";
import { DESIGN_TEXTS } from "../design/design-texts";
import { TextField } from "../design/text-field";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { useLocale, useTexts } from "../locale/use-locale";
import { ARCHIVE_TEXTS, canvasTitle, reportsSentence, type SwitchFailure } from "./archive-texts";

// `running` : verrouillée jusqu'à la réponse. `failed` : elle reste ouverte, et dit pourquoi.
export type SwitchStatus = "idle" | "running" | "failed";

// Ce que le streamer a demandé : archiver le canvas actif, ou rouvrir une archive.
export type SwitchRequest =
  | { kind: "archive"; canvas: ListedCanvas }
  | { kind: "reopen"; archive: ListedArchive };

type SwitchWindowProps = {
  request: SwitchRequest | null; // `null` : fermée
  name: string; // le nom facultatif, pour archiver seulement
  onName: (name: string) => void;
  progress: ProgressChoice | null; // aucune n'est présélectionnée
  onProgress: (progress: ProgressChoice) => void;
  pendingReports: number;
  status: SwitchStatus;
  failure: SwitchFailure | null;
  onConfirm: () => void;
  onClose: () => void;
};

export const SwitchWindow = ({
  request,
  name,
  onName,
  progress,
  onProgress,
  pendingReports,
  status,
  failure,
  onConfirm,
  onClose,
}: SwitchWindowProps) => {
  const locale = useLocale();
  const t = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const shown = useShownWhileClosing(request);
  if (!shown) return null;
  const isArchive = shown.kind === "archive";
  const isRunning = status === "running";
  const reports = reportsSentence(pendingReports, locale);
  return (
    <SmallWindow
      isOpen={request !== null}
      title={isArchive ? t.archiveTitle : t.reopenTitle}
      onClose={onClose}
      isLocked={isRunning}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button
            label={isArchive ? t.archiveAction : t.reopen}
            variant="primary"
            isDisabled={progress === null}
            onPress={onConfirm}
          />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">
        {shown.kind === "archive" ? t.archiveSentence : t.reopenSentence(canvasTitle(shown.archive, locale))}
      </p>
      {isArchive && (
        <TextField
          label={t.archiveName}
          placeholder={t.namePlaceholder}
          value={name}
          maxLength={ARCHIVE_NAME_MAX_LENGTH}
          isDisabled={isRunning}
          onInput={onName}
        />
      )}
      {reports && <p className="lp-type-caption lp-muted lp-prompt">{reports}</p>}
      <ChoiceList
        label={t.progressLabel}
        options={t.progressOptions[shown.kind]}
        value={progress}
        isDisabled={isRunning}
        onSelect={onProgress}
      />
      {status === "failed" && failure && (
        <p className="lp-type-caption lp-danger lp-prompt">{t.switchFailure(failure)}</p>
      )}
    </SmallWindow>
  );
};

type DiscardWindowProps = {
  archive: ListedArchive | null; // `null` : fermée
  status: SwitchStatus;
  failure: SwitchFailure | null;
  onConfirm: () => void;
  onClose: () => void;
};

export const DiscardWindow = ({ archive, status, failure, onConfirm, onClose }: DiscardWindowProps) => {
  const locale = useLocale();
  const t = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const shown = useShownWhileClosing(archive);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={archive !== null}
      title={t.discardTitle}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button label={t.discard} variant="danger" onPress={onConfirm} />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">{t.discardSentence(canvasTitle(shown, locale))}</p>
      {status === "failed" && failure && (
        <p className="lp-type-caption lp-danger lp-prompt">{t.switchFailure(failure)}</p>
      )}
    </SmallWindow>
  );
};
