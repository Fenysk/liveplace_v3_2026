// La confirmation d'une modération (CDC 2026, JOURNAL 2026-09-25) : une petite fenêtre, l'aperçu des pixels qui
// partent, leur nombre, puis Annuler ou l'action. Retirer ses pixels vise d'abord la pose inspectée, et s'étend par
// une plage d'heures ou à tous ses pixels (JOURNAL 2026-09-28), puis propose de bannir l'auteur. Signaler une pose
// passe par la même fenêtre, avec la même plage (JOURNAL 2026-09-29). L'affichage seul, nourri par `useModeration`
// et `useReport`.

import type { AuthoredPixel, InspectEntry } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { Checkbox } from "../design/checkbox";
import { PixelPreview } from "../design/pixel-preview";
import { Slider } from "../design/slider";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { CLEAR_SPAN_STEPS, type ClearScope } from "./cleared-pixels";
import { CONNECTION_LOST, pixelCountLabel } from "./moderation-texts";

// Retirer ses pixels, bannir (qui les retire aussi), bannir juste après un retrait, ou signaler.
export type ModerationKind = "clear" | "ban" | "banAfterClear" | "report";

// Écart §4.3 (JOURNAL 2026-09-27) : l'identifiant de l'auteur n'arrive qu'à qui modère.
export type ModeratedAuthor = InspectEntry & { userId: string };

// La cible est l'auteur et la pose affichés au moment du clic, jamais la case relue : elle peut changer pendant
// qu'on hésite. Une pose signalée la donne aussi (JOURNAL 2026-09-28).
export type ModerationTarget = Pick<ModeratedAuthor, "userId" | "displayName" | "placementId">;

// Qui signale n'a pas l'identifiant de l'auteur : la case inspectée et sa pose le désignent (JOURNAL 2026-09-29).
export type ReportTarget = Pick<InspectEntry, "displayName" | "placementId"> & { x: number; y: number };

export type ModerationRequest =
  | { kind: Exclude<ModerationKind, "report">; author: ModerationTarget }
  | { kind: "report"; author: ReportTarget };

// `running` : verrouillée jusqu'à la dernière tranche. `failed` : la fenêtre reste ouverte et le dit.
export type ModerationStatus = "idle" | "running" | "failed";

export type CanvasPreviewProps = { width: number; height: number; palette: readonly string[] };

export type ModerationWindowProps = {
  request: ModerationRequest | null; // `null` : fermée
  pixels: readonly AuthoredPixel[] | null; // ceux que vise l'action ; `null` : l'aperçu se charge
  scope: ClearScope; // Retirer ses pixels et Signaler
  status: ModerationStatus;
  canvas: CanvasPreviewProps;
  onScope: (scope: ClearScope) => void;
  onConfirm: () => void;
  onClose: () => void;
};

const titleOf = ({ kind, author }: ModerationRequest, { isAll, spanMs }: ClearScope): string => {
  const name = author.displayName;
  if (kind === "ban") return `Bannir ${name} ?`;
  if (kind === "banAfterClear") return `C'est retiré. Bannir aussi ${name} ?`;
  if (kind === "report")
    return spanMs === 0 ? `Signaler cette pose de ${name} ?` : `Signaler ces poses de ${name} ?`;
  if (isAll) return `Retirer tous les pixels de ${name} ?`;
  return spanMs === 0 ? `Retirer cette pose de ${name} ?` : `Retirer ces poses de ${name} ?`;
};

const BAN_CONSEQUENCE = "Ce compte ne pourra plus poser sur ce canvas, et ses pixels seront retirés.";

const TEXTS: Record<
  ModerationKind,
  { consequence: string; confirm: string; cancel: string; variant: "danger" | "primary" }
> = {
  clear: {
    consequence: "Ceux du dessous reviendront.",
    confirm: "Retirer",
    cancel: "Annuler",
    variant: "danger",
  },
  ban: { consequence: BAN_CONSEQUENCE, confirm: "Bannir", cancel: "Annuler", variant: "danger" },
  banAfterClear: { consequence: BAN_CONSEQUENCE, confirm: "Bannir", cancel: "Non", variant: "danger" },
  report: {
    consequence: "Assez de signalements, et la pose quitte le stream jusqu'à la décision d'un modérateur.",
    confirm: "Signaler",
    cancel: "Annuler",
    variant: "primary",
  },
};

type PreviewProps = Pick<ModerationWindowProps, "pixels" | "canvas"> & { name: string };

const Preview = ({ pixels, canvas, name }: PreviewProps) => {
  if (!pixels) return <span className="lp-type-caption lp-muted">Chargement de l'aperçu…</span>;
  if (pixels.length === 0) return null;
  return <PixelPreview {...canvas} pixels={pixels} label={`Les pixels de ${name}`} />;
};

type ScopeControlsProps = Pick<ModerationWindowProps, "scope" | "onScope"> & {
  isDisabled: boolean;
  hasAll: boolean; // la case « Retirer tous ses pixels » : pour qui modère seulement
};

// Cochée, la plage disparaît et tous ses pixels partent (CDC 2026, Inspection).
const ScopeControls = ({ scope, onScope, isDisabled, hasAll }: ScopeControlsProps) => {
  const pickSpan = (spanMs: number) => onScope({ ...scope, spanMs });
  return (
    <>
      {hasAll && (
        <Checkbox
          label="Retirer tous ses pixels"
          isChecked={scope.isAll}
          isDisabled={isDisabled}
          onToggle={(isAll) => onScope({ ...scope, isAll })}
        />
      )}
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
  const hasScope = shown.kind === "clear" || shown.kind === "report";
  return (
    <SmallWindow
      isOpen={request !== null}
      title={titleOf(shown, scope)}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label={texts.cancel} kbd="Échap" onPress={onClose} />
          <Button label={texts.confirm} variant={texts.variant} isDisabled={!pixels} onPress={onConfirm} />
        </>
      }
    >
      {hasScope && (
        <ScopeControls
          scope={scope}
          onScope={onScope}
          isDisabled={status === "running"}
          hasAll={shown.kind === "clear"}
        />
      )}
      <Preview pixels={pixels} canvas={canvas} name={shown.author.displayName} />
      {pixels && (
        <p className="lp-type-body lp-prompt">
          {pixelCountLabel(pixels.length)}. {texts.consequence}
        </p>
      )}
      {status === "failed" && <p className="lp-type-caption lp-danger lp-prompt">{CONNECTION_LOST}</p>}
    </SmallWindow>
  );
};
