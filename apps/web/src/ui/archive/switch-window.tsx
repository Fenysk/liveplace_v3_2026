// Les fenêtres de confirmation de la section « Archives » (Écart §15, JOURNAL 2026-10-06) : la même pour Archiver et
// Rouvrir, qui dit ce qui va se passer et pose le choix des jauges ; une petite à part pour Supprimer.
// Rien ne se fait avant que le streamer confirme, et la fenêtre se verrouille pendant l'action.

import { ARCHIVE_NAME_MAX_LENGTH } from "@liveplace/domain";
import type { ProgressChoice } from "../../usecase/canvas-switch";
import type { ListedArchive, ListedCanvas } from "../../usecase/list-canvases";
import { Button } from "../design/button";
import { ChoiceList } from "../design/choice-list";
import { TextField } from "../design/text-field";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import {
  ARCHIVE_SENTENCE,
  canvasTitle,
  discardSentence,
  NAME_PLACEHOLDER,
  PROGRESS_LABEL,
  progressOptions,
  reopenSentence,
  reportsSentence,
  type SwitchFailure,
  switchFailureLabel,
} from "./archive-texts";

// `running` : verrouillée jusqu'à la réponse. `failed` : elle reste ouverte, et dit pourquoi.
export type SwitchStatus = "idle" | "running" | "failed";

// Ce que le streamer a demandé : archiver le canvas actif, ou rouvrir une archive.
export type SwitchRequest =
  | { kind: "archive"; canvas: ListedCanvas }
  | { kind: "reopen"; archive: ListedArchive };

const requestSentence = (request: SwitchRequest): string =>
  request.kind === "archive" ? ARCHIVE_SENTENCE : reopenSentence(canvasTitle(request.archive));

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
  const shown = useShownWhileClosing(request);
  if (!shown) return null;
  const isArchive = shown.kind === "archive";
  const isRunning = status === "running";
  const reports = reportsSentence(pendingReports);
  return (
    <SmallWindow
      isOpen={request !== null}
      title={isArchive ? "Archiver ce canvas ?" : "Rouvrir cette archive ?"}
      onClose={onClose}
      isLocked={isRunning}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button
            label={isArchive ? "Archiver" : "Rouvrir"}
            variant="primary"
            isDisabled={progress === null}
            onPress={onConfirm}
          />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">{requestSentence(shown)}</p>
      {isArchive && (
        <TextField
          label="Nom de l'archive (facultatif)"
          placeholder={NAME_PLACEHOLDER}
          value={name}
          maxLength={ARCHIVE_NAME_MAX_LENGTH}
          isDisabled={isRunning}
          onInput={onName}
        />
      )}
      {reports && <p className="lp-type-caption lp-muted lp-prompt">{reports}</p>}
      <ChoiceList
        label={PROGRESS_LABEL}
        options={progressOptions(shown.kind)}
        value={progress}
        isDisabled={isRunning}
        onSelect={onProgress}
      />
      {status === "failed" && failure && (
        <p className="lp-type-caption lp-danger lp-prompt">{switchFailureLabel(failure)}</p>
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
  const shown = useShownWhileClosing(archive);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={archive !== null}
      title="Supprimer cette archive ?"
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button label="Supprimer" variant="danger" onPress={onConfirm} />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">{discardSentence(canvasTitle(shown))}</p>
      {status === "failed" && failure && (
        <p className="lp-type-caption lp-danger lp-prompt">{switchFailureLabel(failure)}</p>
      )}
    </SmallWindow>
  );
};
