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
type CurrentColorButtonProps = { color?: string | undefined; isExpanded: boolean; onPress: () => void };

export const CurrentColorButton = ({ color, isExpanded, onPress }: CurrentColorButtonProps) => {
  const label = isExpanded ? "Masquer les couleurs" : "Toutes les couleurs";
  return (
    <button
      type="button"
      className="lp-btn lp-current-color"
      aria-expanded={isExpanded}
      aria-label={label}
      title={label}
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
