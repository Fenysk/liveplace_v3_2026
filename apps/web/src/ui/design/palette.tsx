// La palette du mode Dessin (CDC 2026) : la gomme en tête, puis les couleurs du canvas, dans leur ordre.
// Les couleurs arrivent par props (la palette de `domain`) : aucune n'est écrite dans le CSS.
// Au clavier (JOURNAL 2026-10-09) : un groupe radio, un seul arrêt de Tab sur la couleur actuelle, les flèches mènent le
// focus et choisissent. Chaque couleur garde son nom `Couleur #hex` : la palette n'a pas de noms.

import { TRANSPARENT_COLOR_INDEX } from "@liveplace/domain";
import { ChevronUp, Eraser } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { blurAfterClick } from "./button";
import { classNames } from "./class-names";
import { PALETTE_SELECTOR, SWATCH_COLUMNS, type SwatchPress, swatchKey } from "./swatch-keys";
import type { SwatchTone } from "./swatch-tones";

const PALETTE_LABEL = "Toutes les couleurs";

type PaletteProps = {
  palette: readonly string[]; // indexée par `colorIndex`, le transparent en 0
  colorIndex: number; // la couleur armée, TRANSPARENT_COLOR_INDEX pour la gomme
  onPick: (colorIndex: number) => void; // un clic, une flèche, Entrée ou Espace
  onDone?: () => void; // un clic, Entrée, Espace ou Échap : la feuille mobile se replie
  isTouch?: boolean; // pastilles rondes de la taille d'un contrôle, six par rangée
  hasEraser?: boolean; // sur mobile, la gomme est dans la rangée d'outils
};

// Les `colorIndex` des cases, dans l'ordre où la grille les montre : la gomme, puis la palette sans son transparent.
const swatchColorIndexes = (palette: readonly string[], hasEraser: boolean): number[] => {
  const shades = palette.map((_color, index) => index).filter((index) => index !== TRANSPARENT_COLOR_INDEX);
  return hasEraser ? [TRANSPARENT_COLOR_INDEX, ...shades] : shades;
};

const toSwatchPress = (event: KeyboardEvent): SwatchPress => ({
  key: event.key,
  code: event.code,
  hasModifier: event.ctrlKey || event.metaKey || event.altKey,
});

// Les cases du groupe où se trouve la case du focus, dans l'ordre de la grille.
const radiosAround = (radio: HTMLElement): Element[] => [
  ...(radio.closest(PALETTE_SELECTOR)?.querySelectorAll("[role=radio]") ?? []),
];

const focusRadio = (radio: Element | undefined): void => {
  if (radio instanceof HTMLElement) radio.focus();
};

export const Palette = ({
  palette,
  colorIndex,
  onPick,
  onDone,
  isTouch = false,
  hasEraser = true,
}: PaletteProps) => {
  const cells = swatchColorIndexes(palette, hasEraser);
  // Le seul arrêt de Tab : la couleur actuelle, ou la première case quand elle n'est pas dans la grille.
  const tabStop = cells.includes(colorIndex) ? colorIndex : cells[0];
  const columns = isTouch ? SWATCH_COLUMNS.touch : SWATCH_COLUMNS.pointer;

  // Choisir une couleur, ou seulement refermer : sans couleur.
  const finish = (cell?: number) => {
    if (cell !== undefined) onPick(cell);
    onDone?.();
  };
  // Une flèche mène le focus à la case voisine et la choisit ; Entrée et Espace choisissent, Échap renonce : ces trois
  // rendent le focus au canvas, sans quitter le Dessin.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const radios = radiosAround(event.currentTarget);
    const index = radios.indexOf(event.currentTarget);
    const result = swatchKey(toSwatchPress(event), index, cells.length, columns);
    if (!result) return;
    event.preventDefault();
    if (result.kind === "move") {
      focusRadio(radios[result.index]);
      onPick(cells[result.index] ?? colorIndex);
      return;
    }
    finish(result.kind === "choose" ? cells[index] : undefined);
    event.currentTarget.blur();
  };
  const radioProps = (cell: number) => ({
    role: "radio",
    "aria-checked": colorIndex === cell,
    tabIndex: cell === tabStop ? 0 : -1,
    onKeyDown,
    onClick: blurAfterClick(() => finish(cell)),
  });

  return (
    <div
      className={classNames("lp-palette", isTouch && "lp-palette--touch")}
      role="radiogroup"
      aria-label={PALETTE_LABEL}
      data-palette=""
    >
      {hasEraser && (
        <button
          type="button"
          className="lp-swatch lp-swatch--eraser"
          title="Gomme (E)"
          aria-label="Gomme"
          {...radioProps(TRANSPARENT_COLOR_INDEX)}
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
            {...radioProps(index)}
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

export const CurrentColorButton = ({ color, onPress }: CurrentColorButtonProps) => (
  <button
    type="button"
    className="lp-btn lp-current-color"
    aria-label={PALETTE_LABEL}
    title={PALETTE_LABEL}
    onClick={blurAfterClick(onPress)}
  >
    <i className={classNames(!color && "is-transparent")} style={color ? { background: color } : undefined} />
    <ChevronUp aria-hidden="true" />
  </button>
);

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
// JOURNAL 2026-10-09 : au clavier, les touches 1 à 5 prennent la case de leur rang, y compris quand la rangée n'est pas montrée.
type RecentSwatchesProps = {
  palette: readonly string[];
  recentColorIndexes: readonly number[];
  onPick: (colorIndex: number) => void;
};

export const RecentSwatches = ({ palette, recentColorIndexes, onPick }: RecentSwatchesProps) => (
  <>
    {recentColorIndexes.map((index, place) => (
      <button
        key={index}
        type="button"
        className="lp-swatch lp-swatch--recent"
        style={{ background: palette[index] }}
        title={`${palette[index]} (${place + 1})`}
        aria-label={`Couleur ${palette[index]}`}
        aria-keyshortcuts={String(place + 1)}
        onClick={blurAfterClick(() => onPick(index))}
      />
    ))}
  </>
);
