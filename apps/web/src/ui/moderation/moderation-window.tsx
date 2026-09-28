// La confirmation d'une modération (CDC 2026, JOURNAL 2026-09-25) : une petite fenêtre, l'aperçu des pixels qui
// partent, leur nombre, puis Annuler ou l'action. Retirer ses pixels vise d'abord la pose inspectée, et s'étend par
// une plage d'heures ou à tous ses pixels (JOURNAL 2026-09-28). L'affichage seul, nourri par `useModeration`.

import type { AuthoredPixel, InspectEntry } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { Checkbox } from "../design/checkbox";
import { PixelPreview } from "../design/pixel-preview";
import { Slider } from "../design/slider";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { CLEAR_SPAN_STEPS, type ClearScope } from "./cleared-pixels";
import { CONNECTION_LOST, pixelCountLabel } from "./moderation-texts";

// Ce que la pill Inspection propose : retirer ses pixels, ou le bannir (qui les retire aussi).
export type ModerationKind = "clear" | "ban";

// Écart §4.3 (JOURNAL 2026-09-27) : l'identifiant de l'auteur n'arrive qu'à qui modère.
export type ModeratedAuthor = InspectEntry & { userId: string };

// La cible est l'auteur et la pose affichés au moment du clic, jamais la case relue : elle peut changer pendant
// qu'on hésite. Une pose signalée la donne aussi (JOURNAL 2026-09-28).
export type ModerationTarget = Pick<ModeratedAuthor, "userId" | "displayName" | "placementId">;

export type ModerationRequest = { kind: ModerationKind; author: ModerationTarget };

// `running` : verrouillée jusqu'à la dernière tranche. `failed` : la fenêtre reste ouverte et le dit.
export type ModerationStatus = "idle" | "running" | "failed";

export type CanvasPreviewProps = { width: number; height: number; palette: readonly string[] };

export type ModerationWindowProps = {
  request: ModerationRequest | null; // `null` : fermée
  pixels: readonly AuthoredPixel[] | null; // ceux qui partent ; `null` : l'aperçu se charge
  scope: ClearScope; // Retirer ses pixels seulement
  status: ModerationStatus;
  canvas: CanvasPreviewProps;
  onScope: (scope: ClearScope) => void;
  onConfirm: () => void;
  onClose: () => void;
};

const titleOf = ({ kind, author }: ModerationRequest, { isAll, spanMs }: ClearScope): string => {
  if (kind === "ban") return `Bannir ${author.displayName} ?`;
  if (isAll) return `Retirer tous les pixels de ${author.displayName} ?`;
  return spanMs === 0
    ? `Retirer cette pose de ${author.displayName} ?`
    : `Retirer ces poses de ${author.displayName} ?`;
};

const TEXTS: Record<ModerationKind, { consequence: string; confirm: string }> = {
  clear: { consequence: "Ceux du dessous reviendront.", confirm: "Retirer" },
  ban: {
    consequence: "Ce compte ne pourra plus poser sur ce canvas, et ses pixels seront retirés.",
    confirm: "Bannir",
  },
};

type PreviewProps = Pick<ModerationWindowProps, "pixels" | "canvas"> & { author: ModerationTarget };

const Preview = ({ pixels, canvas, author }: PreviewProps) => {
  if (!pixels) return <span className="lp-type-caption lp-muted">Chargement de l'aperçu…</span>;
  if (pixels.length === 0) return null;
  return <PixelPreview {...canvas} pixels={pixels} label={`Les pixels de ${author.displayName}`} />;
};

type ScopeControlsProps = Pick<ModerationWindowProps, "scope" | "onScope"> & { isDisabled: boolean };

// Cochée, la plage disparaît et tous ses pixels partent (CDC 2026, Inspection).
const ScopeControls = ({ scope, onScope, isDisabled }: ScopeControlsProps) => {
  const pickSpan = (spanMs: number) => onScope({ ...scope, spanMs });
  return (
    <>
      <Checkbox
        label="Retirer tous ses pixels"
        isChecked={scope.isAll}
        isDisabled={isDisabled}
        onToggle={(isAll) => onScope({ ...scope, isAll })}
      />
      {!scope.isAll && (
        <Slider
          label="Plage de temps"
          steps={CLEAR_SPAN_STEPS}
          value={scope.spanMs}
          isDisabled={isDisabled}
          onPick={pickSpan}
          onMove={pickSpan}
        />
      )}
    </>
  );
};

export const ModerationWindow = ({
  request,
  pixels,
  scope,
  status,
  canvas,
  onScope,
  onConfirm,
  onClose,
}: ModerationWindowProps) => {
  const shown = useShownWhileClosing(request);
  if (!shown) return null;
  const texts = TEXTS[shown.kind];
  return (
    <SmallWindow
      isOpen={request !== null}
      title={titleOf(shown, scope)}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button label={texts.confirm} variant="danger" isDisabled={!pixels} onPress={onConfirm} />
        </>
      }
    >
      {shown.kind === "clear" && (
        <ScopeControls scope={scope} onScope={onScope} isDisabled={status === "running"} />
      )}
      <Preview pixels={pixels} canvas={canvas} author={shown.author} />
      {pixels && (
        <p className="lp-type-body lp-prompt">
          {pixelCountLabel(pixels.length)}. {texts.consequence}
        </p>
      )}
      {status === "failed" && <p className="lp-type-caption lp-danger lp-prompt">{CONNECTION_LOST}</p>}
    </SmallWindow>
  );
};
