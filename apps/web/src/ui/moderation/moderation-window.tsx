// La confirmation d'une modération (CDC 2026, JOURNAL 2026-09-25) : une petite fenêtre, l'aperçu des pixels qui
// partent, leur nombre, puis Annuler ou l'action. Retirer ses pixels vise d'abord la pose inspectée, ou toutes celles
// d'une ligne de signalements (JOURNAL 2026-10-07), et s'étend par une plage d'heures ou à tous ses pixels (JOURNAL
// 2026-09-28), puis propose de bannir l'auteur. Signaler une pose passe par la même fenêtre, avec la même plage
// (JOURNAL 2026-09-29). L'affichage seul, nourri par `useModeration` et `useReport`.

import type { AuthoredPixel, InspectEntry } from "@liveplace/domain/ports";
import { useRef } from "react";
import { Button } from "../design/button";
import { Checkbox } from "../design/checkbox";
import { classNames } from "../design/class-names";
import { PixelPreview } from "../design/pixel-preview";
import { Slider } from "../design/slider";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { type ClearScope, type ClearTarget, clearSpanSteps } from "./cleared-pixels";
import { ConnectionLost } from "./connection-lost";
import { pixelCountLabel } from "./moderation-texts";

// Retirer ses pixels, bannir (qui les retire aussi), bannir juste après un retrait, ou signaler.
export type ModerationKind = "clear" | "ban" | "banAfterClear" | "report";

// §4.3 : l'identifiant de l'auteur n'arrive qu'à qui modère.
export type ModeratedAuthor = InspectEntry & { userId: string };

// La cible est l'auteur et la pose affichés au moment du clic, jamais la case relue : elle peut changer pendant
// qu'on hésite. Une ligne de signalements la donne aussi (JOURNAL 2026-09-28), avec toutes ses poses si elle en a
// plusieurs (JOURNAL 2026-10-07). `moderatorOrigin` : un modérateur nommé ici ne se bannit pas (Écart §5.4, JOURNAL 2026-10-08).
export type ModerationTarget = Pick<
  ModeratedAuthor,
  "userId" | "displayName" | "placementId" | "moderatorOrigin"
> &
  Pick<ClearTarget, "placementIds">;

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

// Les poses que Retirer vise : toutes celles d'une ligne de signalements, sinon une.
const placementCountOf = (request: ModerationRequest): number =>
  request.kind === "clear" ? (request.author.placementIds?.length ?? 1) : 1;

const titleOf = (request: ModerationRequest, { isAll, spanMs }: ClearScope): string => {
  const { kind, author } = request;
  const name = author.displayName;
  if (kind === "ban") return `Bannir ${name} ?`;
  if (kind === "banAfterClear") return `C'est retiré. Bannir aussi ${name} ?`;
  if (kind === "report")
    return spanMs === 0 ? `Signaler cette pose de ${name} ?` : `Signaler ces poses de ${name} ?`;
  if (isAll) return `Retirer tous les pixels de ${name} ?`;
  return spanMs === 0 && placementCountOf(request) <= 1
    ? `Retirer cette pose de ${name} ?`
    : `Retirer ces poses de ${name} ?`;
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
  placementCount: number;
};

// Cochée, la plage disparaît et tous ses pixels partent (CDC 2026, Inspection).
const ScopeControls = ({ scope, onScope, isDisabled, hasAll, placementCount }: ScopeControlsProps) => {
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
          steps={clearSpanSteps(placementCount)}
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
  const count = useRef<string | null>(null);
  if (!shown) return null;
  const texts = TEXTS[shown.kind];
  const hasScope = shown.kind === "clear" || shown.kind === "report";
  const title = titleOf(shown, scope);
  // Fermée, la fenêtre garde son dernier décompte : sans demande, les hooks rendent tous les pixels, un chiffre que
  // personne n'a demandé, que la région dirait pendant la fermeture.
  if (request) count.current = pixels ? `${pixelCountLabel(pixels.length)}. ${texts.consequence}` : null;
  return (
    <SmallWindow
      isOpen={request !== null}
      title={title}
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
          placementCount={placementCountOf(shown)}
        />
      )}
      {/* « C'est retiré. » n'est écrit que dans le titre de cette étape, qui change fenêtre ouverte : la région le redit, avant le décompte. */}
      <span role="status" className="lp-visually-hidden">
        {shown.kind === "banAfterClear" ? title : null}
      </span>
      <Preview pixels={pixels} canvas={canvas} name={shown.author.displayName} />
      {/* Des régions toujours là, vides jusqu'à leur message : le décompte arrive avec l'aperçu et suit la plage, l'échec s'alerte. */}
      <p
        role="status"
        className={classNames("lp-type-body lp-prompt", !count.current && "lp-visually-hidden")}
      >
        {count.current}
      </p>
      <ConnectionLost isFailed={status === "failed"} className="lp-prompt" />
    </SmallWindow>
  );
};
