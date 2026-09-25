// La palette du mode Dessin (CDC 2026) : la gomme en tête, puis les couleurs du canvas, dans leur ordre.
// Les couleurs arrivent par props (la palette de `domain`) : aucune n'est écrite dans le CSS.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { ChevronUp, Eraser } from "lucide-react";
import type { ReactNode } from "react";
import { blurAfterClick } from "./button";
import { classNames } from "./class-names";

type PaletteProps = {
  palette: readonly string[]; // indexée par `colorIndex`, le transparent en 0
  colorIndex: number; // la couleur armée, TRANSPARENT_COLOR_INDEX pour la gomme
  onPick: (colorIndex: number) => void;
  isTouch?: boolean; // pastilles rondes de la taille d'un contrôle, six par rangée
  hasEraser?: boolean; // sur mobile, la gomme est dans la rangée d'outils
};

export const Palette = ({ palette, colorIndex, onPick, isTouch = false, hasEraser = true }: PaletteProps) => (
  <div className={classNames("lp-palette", isTouch && "lp-palette--touch")}>
    {hasEraser && (
      <button
        type="button"
        className="lp-swatch lp-swatch--eraser"
        title="Gomme (E)"
        aria-label="Gomme"
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
          aria-label={`Couleur ${color}`}
          aria-pressed={colorIndex === index}
          onClick={blurAfterClick(() => onPick(index))}
        />
      ),
    )}
  </div>
);

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

export const CurrentColorButton = ({ color, onPress }: CurrentColorButtonProps) => (
  <button
    type="button"
    className="lp-btn lp-current-color"
    aria-label="Toutes les couleurs"
    title="Toutes les couleurs"
    onClick={blurAfterClick(onPress)}
  >
    <i className={classNames(!color && "is-transparent")} style={color ? { background: color } : undefined} />
    <ChevronUp aria-hidden="true" />
  </button>
);

// Sur mobile, la rangée des couleurs récentes, à côté de la couleur actuelle : toucher une case l'échange avec elle.
type RecentSwatchesProps = {
  palette: readonly string[];
  recentColorIndexes: readonly number[];
  onPick: (colorIndex: number) => void;
};

export const RecentSwatches = ({ palette, recentColorIndexes, onPick }: RecentSwatchesProps) => (
  <>
    {recentColorIndexes.map((index) => (
      <button
        key={index}
        type="button"
        className="lp-swatch lp-swatch--recent"
        style={{ background: palette[index] }}
        title={palette[index]}
        aria-label={`Couleur ${palette[index]}`}
        onClick={blurAfterClick(() => onPick(index))}
      />
    ))}
  </>
);
