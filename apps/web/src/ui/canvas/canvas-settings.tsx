// La section Canvas de la fenêtre (CDC 2026, Fenêtre ; JOURNAL 2026-09-29), pour le streamer : le thème du canvas, un format,
// puis Petit, Moyen ou Grand, et la confirmation qui montre ce qui sort du cadre. L'affichage seul, nourri par `CanvasTab`.

import {
  CANVAS_FORMATS,
  type CanvasFormat,
  type CanvasSize,
  GAUGE_MAX_CEILING_BOUND,
  GAUGE_MAX_START_BOUNDS,
  type GaugeLimits,
  THEME_MAX_LENGTH,
} from "@liveplace/domain";
import type { Pixel } from "@liveplace/domain/ports";
import { ARCHIVE_TEXTS } from "../archive/archive-texts";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { PixelPreview } from "../design/pixel-preview";
import { Segmented, type SegmentedOption } from "../design/segmented";
import { Slider, type SliderStep } from "../design/slider";
import { TextField } from "../design/text-field";
import { SmallWindow, useShownWhileClosing } from "../design/window";
import { useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import type { CanvasPreviewProps } from "../moderation/moderation-window";
import type { SizeChoice } from "./canvas-size";
import { CANVAS_TEXTS } from "./canvas-texts";

const FORMAT_OPTIONS: readonly SegmentedOption<CanvasFormat>[] = CANVAS_FORMATS.map(({ format }) => ({
  value: format,
  label: format,
}));

// La place de la taille dans son format, en texte : ce que les boutons radio savent porter.
const SIZE_KEYS = ["0", "1", "2"] as const;
type SizeKey = (typeof SIZE_KEYS)[number];

// Le champ du thème du canvas en cours : lu à l'ouverture, enregistré quand il perd le focus (use-theme-field.ts).
// `unavailable` : le thème ne se lit pas, le champ reste fermé.
export type ThemeField = {
  status: "loading" | "unavailable" | "ready";
  value: string;
  isSaving: boolean;
  onInput: (value: string) => void;
  onCommit: () => void;
};

export const ThemeSettings = ({ theme }: { theme: ThemeField }) => {
  const t = useTexts(ARCHIVE_TEXTS);
  return (
    <div className="lp-setting">
      <TextField
        label={t.themeLabel}
        placeholder={t.themePlaceholder}
        value={theme.value}
        maxLength={THEME_MAX_LENGTH}
        isDisabled={theme.status !== "ready" || theme.isSaving}
        onInput={theme.onInput}
        onCommit={theme.onCommit}
      />
      <p className="lp-type-caption lp-muted">{t.themeCaption}</p>
      {theme.status === "unavailable" && <p className="lp-type-caption lp-danger">{t.canvasesUnavailable}</p>}
    </div>
  );
};

type CanvasSettingsProps = {
  theme: ThemeField;
  current: CanvasSize;
  choice: SizeChoice;
  chosen: CanvasSize; // la taille de `choice`
  onChoose: (choice: SizeChoice) => void;
  onApply: () => void; // ouvre la confirmation
};

export const CanvasSettings = ({
  theme,
  current,
  choice,
  chosen,
  onChoose,
  onApply,
}: CanvasSettingsProps) => {
  const t = useTexts(CANVAS_TEXTS);
  const isCurrent = chosen.width === current.width && chosen.height === current.height;
  const sizeOptions: readonly SegmentedOption<SizeKey>[] = SIZE_KEYS.map((value) => ({
    value,
    label: t.sizeNames[value],
  }));
  return (
    <>
      <ThemeSettings theme={theme} />
      <div className="lp-setting">
        <span className="lp-type-body">{t.canvasSize}</span>
        <p className="lp-type-caption lp-muted">{t.currentSize(t.cellsLabel(current))}</p>
      </div>
      <div className="lp-setting">
        <Segmented
          label={t.format}
          options={FORMAT_OPTIONS}
          value={choice.format}
          onSelect={(format) => onChoose({ ...choice, format })}
        />
        <Segmented
          label={t.size}
          options={sizeOptions}
          value={SIZE_KEYS[choice.sizeIndex] ?? "0"}
          onSelect={(sizeIndex) => onChoose({ ...choice, sizeIndex: Number(sizeIndex) })}
        />
        <p className="lp-type-caption lp-muted">
          {t.chosenSize({ format: t.formatNames[choice.format], size: t.cellsLabel(chosen) })}
        </p>
        <div className="lp-row">
          <Button label={t.changeSize} variant="primary" isDisabled={isCurrent} onPress={onApply} />
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
  const t = useTexts(CANVAS_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const moderation = useTexts(MODERATION_TEXTS);
  const shown = useShownWhileClosing(next);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={next !== null}
      title={t.resizeTitle(t.cellsLabel(shown))}
      onClose={onClose}
      isLocked={status === "running"}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button label={t.changeSize} variant="primary" onPress={onConfirm} />
        </>
      }
    >
      {outside.length > 0 && <PixelPreview {...canvas} pixels={outside} label={t.outsideLabel} />}
      <p className="lp-type-body lp-prompt">
        {outside.length > 0 ? t.outsideSentence(outside.length) : t.nothingOutside}
      </p>
      {status === "failed" && (
        <p className="lp-type-caption lp-danger lp-prompt">{moderation.connectionLost}</p>
      )}
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

export const GaugeSettings = ({ limits, onPick }: GaugeSettingsProps) => {
  const t = useTexts(CANVAS_TEXTS);
  return (
    <>
      <div className="lp-setting">
        <span className="lp-type-body">{t.playerGauge}</span>
        <p className="lp-type-caption lp-muted">{t.playerGaugeNote}</p>
      </div>
      <div className="lp-setting">
        <Slider
          label={t.startingGauge}
          steps={START_STEPS}
          value={limits.gaugeMaxStart}
          onPick={(gaugeMaxStart) =>
            onPick({ gaugeMaxStart, gaugeMaxCeiling: Math.max(gaugeMaxStart, limits.gaugeMaxCeiling) })
          }
        />
        <Slider
          label={t.maximumGauge}
          steps={ceilingSteps(limits)}
          value={limits.gaugeMaxCeiling}
          onPick={(gaugeMaxCeiling) => onPick({ ...limits, gaugeMaxCeiling })}
        />
      </div>
    </>
  );
};

type CeilingWindowProps = {
  next: GaugeLimits | null; // `null` : fermée
  onConfirm: () => void;
  onClose: () => void;
};

// Baisser le plafond fait redescendre des joueurs : ce qu'ils ont réclamé reste acquis, et revient s'il remonte.
export const CeilingWindow = ({ next, onConfirm, onClose }: CeilingWindowProps) => {
  const t = useTexts(CANVAS_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const shown = useShownWhileClosing(next);
  if (!shown) return null;
  return (
    <SmallWindow
      isOpen={next !== null}
      title={t.lowerTitle(shown.gaugeMaxCeiling)}
      onClose={onClose}
      actions={
        <>
          <Button label={design.cancel} kbd={design.escapeKey} onPress={onClose} />
          <Button label={t.lower} variant="primary" onPress={onConfirm} />
        </>
      }
    >
      <p className="lp-type-body lp-prompt">{t.lowerSentence(shown.gaugeMaxCeiling)}</p>
    </SmallWindow>
  );
};
