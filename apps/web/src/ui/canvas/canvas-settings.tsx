// La section Canvas de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-29), pour le streamer : un format, puis Petit,
// Moyen ou Grand, et la confirmation qui montre ce qui sort du cadre. L'affichage seul, nourri par `CanvasTab`.

import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type CanvasSize,
  GAUGE_MAX_CEILING_BOUND,
  GAUGE_MAX_START_BOUNDS,
  type GaugeLimits,
} from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { Segmented, type SegmentedOption } from "../design/segmented";
import { Slider, type SliderStep } from "../design/slider";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { CONNECTION_LOST, pixelCountLabel } from "../moderation/moderation-texts";
import type { CanvasPreviewProps } from "../moderation/moderation-window";
import type { SizeChoice } from "./canvas-size";

const FORMAT_NAMES: Record<CanvasFormat, string> = {
  "1:1": "Carré",
  "16:9": "Paysage 16:9",
  "9:16": "Portrait 9:16",
  "4:3": "Paysage 4:3",
  "3:4": "Portrait 3:4",
};

const FORMAT_OPTIONS: readonly SegmentedOption<CanvasFormat>[] = CANVAS_FORMATS.map(({ format }) => ({
  value: format,
  label: format,
}));

// La place de la taille dans son format, en texte : ce que les boutons radio savent porter.
const SIZE_KEYS = ["0", "1", "2"] as const;
type SizeKey = (typeof SIZE_KEYS)[number];

const SIZE_OPTIONS: readonly SegmentedOption<SizeKey>[] = [
  { value: "0", label: "Petit" },
  { value: "1", label: "Moyen" },
  { value: "2", label: "Grand" },
];

const sizeLabel = ({ width, height }: CanvasSize): string => `${width} × ${height} cases`;

type CanvasSettingsProps = {
  current: CanvasSize;
  choice: SizeChoice;
  chosen: CanvasSize; // la taille de `choice`
  onChoose: (choice: SizeChoice) => void;
  onApply: () => void; // ouvre la confirmation
};

export const CanvasSettings = ({ current, choice, chosen, onChoose, onApply }: CanvasSettingsProps) => {
  const isCurrent = chosen.width === current.width && chosen.height === current.height;
  return (
    <>
      <div className="lp-setting">
        <span className="lp-type-body">Taille du canvas</span>
        <p className="lp-type-caption lp-muted">Actuellement {sizeLabel(current)}.</p>
      </div>
      <div className="lp-setting">
        <Segmented
          label="Format"
          options={FORMAT_OPTIONS}
          value={choice.format}
          onSelect={(format) => onChoose({ ...choice, format })}
        />
        <Segmented
          label="Taille"
          options={SIZE_OPTIONS}
          value={SIZE_KEYS[choice.sizeIndex] ?? "0"}
          onSelect={(sizeIndex) => onChoose({ ...choice, sizeIndex: Number(sizeIndex) })}
        />
        <p className="lp-type-caption lp-muted">
          {FORMAT_NAMES[choice.format]}, {sizeLabel(chosen)}. Rien ne se perd : ce qui sort du cadre revient
          quand le canvas s'agrandit.
        </p>
        <div className="lp-row">
          <Button label="Changer la taille" variant="primary" isDisabled={isCurrent} onPress={onApply} />
        </div>
      </div>
    </>
  );
};

// `running` : verrouillée jusqu'à la réponse. `failed` : elle reste ouverte et le dit.
export type ResizeStatus = "idle" | "running" | "failed";

type ResizeWindowProps = {
  next: CanvasSize | null; // `null` : fermée
  outside: readonly Pixel[]; // ce qui sort du cadre, sur le canvas d'aujourd'hui
  status: ResizeStatus;
  canvas: CanvasPreviewProps;
  onConfirm: () => void;
  onClose: () => void;
};

export const ResizeWindow = ({ next, outside, status, canvas, onConfirm, onClose }: ResizeWindowProps) => {
  const shown = useShownWhileClosing(next);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={next !== null}
      title={`Passer à ${sizeLabel(shown)} ?`}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button label="Changer la taille" variant="primary" onPress={onConfirm} />
        </>
      }
    >
      {outside.length > 0 && (
        <PixelPreview {...canvas} pixels={outside} label="Les pixels qui sortent du cadre" />
      )}
      <p className="lp-type-body lp-prompt">
        {outside.length > 0
          ? `${pixelCountLabel(outside.length)} sortent du cadre : gardés, invisibles, ils reviennent quand le canvas s'agrandit.`
          : "Aucun pixel posé ne sort du cadre."}
      </p>
      {status === "failed" && <p className="lp-type-caption lp-danger lp-prompt">{CONNECTION_LOST}</p>}
    </SmallWindow>
  );
};

// JOURNAL 2026-09-30 : masqués dans la section Canvas pour l'instant, montrés dans `/design`. La jauge de départ se règle
// à l'unité ; la jauge maximale, à partir du départ puis de 10 en 10.
const CEILING_STEP = 10;

const toStep = (value: number): SliderStep => ({ value, label: String(value) });

const START_STEPS: readonly SliderStep[] = Array.from(
  { length: GAUGE_MAX_START_BOUNDS.max - GAUGE_MAX_START_BOUNDS.min + 1 },
  (_, index) => toStep(GAUGE_MAX_START_BOUNDS.min + index),
);

// La jauge maximale du moment y figure toujours, même hors des dizaines (un départ baissé sous elle).
const ceilingSteps = ({ gaugeMaxStart, gaugeMaxCeiling }: GaugeLimits): SliderStep[] => {
  const first = Math.ceil((gaugeMaxStart + 1) / CEILING_STEP) * CEILING_STEP;
  const tens = Array.from(
    { length: (GAUGE_MAX_CEILING_BOUND - first) / CEILING_STEP + 1 },
    (_, index) => first + index * CEILING_STEP,
  );
  return [...new Set([gaugeMaxStart, gaugeMaxCeiling, ...tens])].sort((a, b) => a - b).map(toStep);
};

type GaugeSettingsProps = {
  limits: GaugeLimits;
  onPick: (limits: GaugeLimits) => void; // un plafond plus bas passe d'abord par la confirmation
};

export const GaugeSettings = ({ limits, onPick }: GaugeSettingsProps) => (
  <>
    <div className="lp-setting">
      <span className="lp-type-body">Jauge des joueurs</span>
      <p className="lp-type-caption lp-muted">
        Chaque joueur part de la jauge de départ et la fait grandir en posant sur ton canvas : un premier +1 à
        réclamer au 12e pixel, puis de plus en plus espacés, jusqu'à la jauge maximale.
      </p>
    </div>
    <div className="lp-setting">
      <Slider
        label="Jauge de départ"
        steps={START_STEPS}
        value={limits.gaugeMaxStart}
        onPick={(gaugeMaxStart) =>
          onPick({ gaugeMaxStart, gaugeMaxCeiling: Math.max(gaugeMaxStart, limits.gaugeMaxCeiling) })
        }
      />
      <Slider
        label="Jauge maximale"
        steps={ceilingSteps(limits)}
        value={limits.gaugeMaxCeiling}
        onPick={(gaugeMaxCeiling) => onPick({ ...limits, gaugeMaxCeiling })}
      />
    </div>
  </>
);

type CeilingWindowProps = {
  next: GaugeLimits | null; // `null` : fermée
  onConfirm: () => void;
  onClose: () => void;
};

// Baisser le plafond fait redescendre des joueurs : ce qu'ils ont réclamé reste acquis, et revient s'il remonte.
export const CeilingWindow = ({ next, onConfirm, onClose }: CeilingWindowProps) => {
  const shown = useShownWhileClosing(next);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={next !== null}
      title={`Baisser la jauge maximale à ${shown.gaugeMaxCeiling} ?`}
      onClose={onClose}
      actions={
        <>
          <Button label="Annuler" kbd="Échap" onPress={onClose} />
          <Button label="Baisser" variant="primary" onPress={onConfirm} />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">
        Les joueurs au-dessus de {shown.gaugeMaxCeiling} charges vont redescendre. Ce qu'ils ont réclamé reste
        acquis : ils le retrouvent si la jauge maximale remonte.
      </p>
    </SmallWindow>
  );
};
