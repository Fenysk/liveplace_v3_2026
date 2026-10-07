// La palette du mode Dessin (CDC 2026) : la gomme en tête, puis les couleurs du canvas, dans leur ordre.
// Les couleurs arrivent par props (la palette de `domain`) : aucune n'est écrite dans le CSS.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { ChevronUp, Eraser } from "lucide-react";
import type { ReactNode } from "react";
import { useTexts } from "../locale/use-locale";
import { blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import type { SwatchTone } from "./swatch-tones";

type PaletteProps = {
  palette: readonly string[]; // indexée par `colorIndex`, le transparent en 0
  colorIndex: number; // la couleur armée, TRANSPARENT_COLOR_INDEX pour la gomme
  onPick: (colorIndex: number) => void;
  isTouch?: boolean; // pastilles rondes de la taille d'un contrôle, six par rangée
  hasEraser?: boolean; // sur mobile, la gomme est dans la rangée d'outils
};

export const Palette = ({ palette, colorIndex, onPick, isTouch = false, hasEraser = true }: PaletteProps) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <div className={classNames("lp-palette", isTouch && "lp-palette--touch")}>
      {hasEraser && (
        <button
          type="button"
          className="lp-swatch lp-swatch--eraser"
          title={t.eraserTip}
          aria-label={t.eraser}
          aria-pressed={colorIndex === TRANSPARENT_COLOR_INDEX}
          onClick={blurAfterClick(() => onPick(TRANSPARENT_COLOR_INDEX))}
        >
          <Eraser aria-hidden="true" />
        </button>
      )}
      {palette.map((color, index) =>
        index === TRANSPARENT_COLOR_INDEX ? null : (
          <button
            key={color}
            type="button"
            className="lp-swatch"
            style={{ background: color }}
            title={color}
            aria-label={t.colorName(color)}
            aria-pressed={colorIndex === index}
            onClick={blurAfterClick(() => onPick(index))}
          />
        ),
      )}
    </div>
  );
};

// Une couleur montrée à côté d'un texte (l'inspection). Sans couleur : le damier du pixel transparent.
type ColorChipProps = { color?: string; children: ReactNode };

export const ColorChip = ({ color, children }: ColorChipProps) => (
  <span className="lp-color-chip">
    <i className={classNames(!color && "is-transparent")} style={color ? { background: color } : undefined} />
    {children}
  </span>
);

// Sur mobile, la couleur actuelle ouvre la palette complète, repliée dans la feuille Dessin. Sans couleur : la gomme.
type CurrentColorButtonProps = { color?: string | undefined; onPress: () => void };

export const CurrentColorButton = ({ color, onPress }: CurrentColorButtonProps) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <button
      type="button"
      className="lp-btn lp-current-color"
      aria-label={t.allColors}
      title={t.allColors}
      onClick={blurAfterClick(onPress)}
    >
      <i
        className={classNames(!color && "is-transparent")}
        style={color ? { background: color } : undefined}
      />
      <ChevronUp aria-hidden="true" />
    </button>
  );
};

// Un choix de couleur au clavier de la palette (Écart §15, JOURNAL 2026-10-06) : les mêmes pastilles, chacune sous son nom.
// Sans `tone`, la pastille est le damier du pixel transparent. Aucune n'est choisie d'avance : `value` à `null`.
// Une teinte est une classe de palette.css, jamais un `style` (swatch-tones.ts).
export type SwatchOption<Value extends string> = { value: Value; label: string; tone?: SwatchTone };

type SwatchChoiceProps<Value extends string> = {
  label: string; // le nom du groupe
  options: readonly SwatchOption<Value>[];
  value: Value | null;
  onSelect: (value: Value) => void;
  isTouch?: boolean; // pastilles rondes de la taille d'un contrôle
};

export const SwatchChoice = <Value extends string>({
  label,
  options,
  value,
  onSelect,
  isTouch = false,
}: SwatchChoiceProps<Value>) => (
  <fieldset className="lp-choices">
    <legend className="lp-type-body">{label}</legend>
    <div className={classNames("lp-palette lp-palette--choice", isTouch && "lp-palette--touch")}>
      {options.map(({ value: optionValue, label: optionLabel, tone }) => (
        <label key={optionValue} className="lp-swatch-option">
          <button
            type="button"
            className={classNames("lp-swatch", tone ? `lp-swatch--${tone}` : "is-transparent")}
            title={optionLabel}
            aria-label={optionLabel}
            aria-pressed={optionValue === value}
            onClick={blurAfterClick(() => onSelect(optionValue))}
          />
          <span className="lp-type-body" aria-hidden="true">
            {optionLabel}
          </span>
        </label>
      ))}
    </div>
  </fieldset>
);

// Sur mobile, la rangée des couleurs récentes, à côté de la couleur actuelle : toucher une case l'échange avec elle.
type RecentSwatchesProps = {
  palette: readonly string[];
  recentColorIndexes: readonly number[];
  onPick: (colorIndex: number) => void;
};

export const RecentSwatches = ({ palette, recentColorIndexes, onPick }: RecentSwatchesProps) => {
  const t = useTexts(DESIGN_TEXTS);
  return (
    <>
      {recentColorIndexes.map((index) => (
        <button
          key={index}
          type="button"
          className="lp-swatch lp-swatch--recent"
          style={{ background: palette[index] }}
          title={palette[index]}
          aria-label={t.colorName(palette[index] ?? "")}
          onClick={blurAfterClick(() => onPick(index))}
        />
      ))}
    </>
  );
};
