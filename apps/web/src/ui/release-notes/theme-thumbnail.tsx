// « Un thème pour la fresque » : une mini-fresque (une épée, un coffre, une potion) et, au centre, la fenêtre Fresque réduite à son champ
// Thème (libellé, champ, phrase d'aide) sur un voile. Une souris clique le champ, le thème s'écrit lettre par lettre, puis elle clique à
// côté : le champ perd le focus, c'est ce qui l'enregistre (il n'a pas de bouton) et le toast le confirme. La fenêtre se ferme et la pill
// Thème du jeu paraît en haut, sa petite phrase au-dessus du thème (theme-motion.ts). L'image fixe : la pill Thème, sans fenêtre ni souris.
// Le champ du jeu est un `<input>` : celui-ci est un `<span>` aux mêmes classes, la vignette étant déjà un bouton.

import { useRef } from "react";
import { ARCHIVE_TEXTS } from "../archive/archive-texts";
import { classNames } from "../design/class-names";
import { DESIGN_TEXTS } from "../design/design-texts";
import { useTexts } from "../locale/use-locale";
import { ToastMini, WindowVeil } from "./inspection-parts";
import { MiniCanvas } from "./mini-canvas";
import { motifCells } from "./pixel-motifs";
import { RELEASE_NOTES_TEXTS } from "./release-notes-texts";
import { ArtAt } from "./scene-art";
import { THEME_RESTING_MS, themeAt } from "./theme-motion";
import { layersOfCells } from "./thumbnail-art";
import { Pointer, setPointer } from "./thumbnail-pointer";
import { setThumbnailVariable } from "./thumbnail-variables";
import { useVisibleLoop } from "./use-visible-loop";

// Le thème est une aventure : ce qu'une épée, un coffre et une potion ont à voir avec lui se lit sans un mot de plus.
const SWORD_LAYERS = layersOfCells(motifCells("sword", 0, 0));
const CHEST_LAYERS = layersOfCells(motifCells("chest", 0, 0));
const POTION_LAYERS = layersOfCells(motifCells("potion", 0, 0));
const SWORD_AT = { x: 12, y: 34 } as const;
const CHEST_AT = { x: 41, y: 43 } as const;
const POTION_AT = { x: 82, y: 40 } as const;

// Chaque image : la fenêtre et son voile, les lettres écrites du champ, le focus et le curseur, le toast, la pill Thème, la souris.
const renderTheme = (host: HTMLElement, timeMs: number): void => {
  const moment = themeAt(timeMs);
  setThumbnailVariable(host, "--lp-release-window", moment.window);
  setThumbnailVariable(host, "--lp-release-toast", moment.toast);
  setThumbnailVariable(host, "--lp-release-theme", moment.pill);
  setThumbnailVariable(host, "--lp-release-caret", moment.caret);
  const letters = host.querySelectorAll<HTMLElement>("[data-letter]");
  const written = Math.round(moment.typed * letters.length);
  letters.forEach((letter, index) => {
    letter.classList.toggle("is-written", index < written);
  });
  const field = host.querySelector<HTMLElement>("[data-target='field']");
  field?.setAttribute("data-empty", String(written === 0));
  field?.setAttribute("data-focused", String(moment.isFocused));
  setPointer(host, moment.pointer, moment.press);
};

export const ThemeThumbnail = () => {
  const host = useRef<HTMLSpanElement>(null);
  const archive = useTexts(ARCHIVE_TEXTS);
  const design = useTexts(DESIGN_TEXTS);
  const release = useTexts(RELEASE_NOTES_TEXTS);
  useVisibleLoop(host, renderTheme, THEME_RESTING_MS);
  const resting = themeAt(THEME_RESTING_MS);
  const letters = Array.from(release.themeExample).map((letter, place) => ({
    id: `${place}${letter}`,
    letter,
  }));
  const written = Math.round(resting.typed * letters.length);
  return (
    <span ref={host} className="lp-release-scene lp-release-text-scene lp-release-theme">
      <MiniCanvas layers={[]}>
        <ArtAt layers={SWORD_LAYERS} x={SWORD_AT.x} y={SWORD_AT.y} />
        <ArtAt layers={CHEST_LAYERS} x={CHEST_AT.x} y={CHEST_AT.y} />
        <ArtAt layers={POTION_LAYERS} x={POTION_AT.x} y={POTION_AT.y} />
      </MiniCanvas>
      <span className="lp-pill lp-pill--title lp-release-pill lp-release-pill--top-center lp-release-theme-pill">
        <span className="lp-pill-content lp-col">
          <span className="lp-release-theme-box">
            <span className="lp-type-caption lp-muted">{design.themeDraw}</span>
            <span className="lp-type-heading lp-release-theme-text">{release.themeExample}</span>
          </span>
        </span>
      </span>
      <WindowVeil />
      <span className="lp-pill lp-release-pill lp-release-confirm">
        <span className="lp-pill-content lp-col">
          <span className="lp-setting">
            <span className="lp-field">
              <span className="lp-type-body">{archive.themeLabel}</span>
              <span
                className="lp-input lp-type-body"
                data-target="field"
                data-empty={String(written === 0)}
                data-focused={String(resting.isFocused)}
              >
                <span className="lp-release-placeholder">{archive.themePlaceholder}</span>
                <span className="lp-release-written">
                  {letters.map(({ id, letter }, place) => (
                    <span
                      key={id}
                      className={classNames("lp-release-letter", place < written && "is-written")}
                      data-letter={place}
                    >
                      {letter}
                    </span>
                  ))}
                </span>
                <span className="lp-release-caret" />
              </span>
            </span>
            <span className="lp-type-caption lp-muted" data-target="caption">
              {archive.themeCaption}
            </span>
          </span>
        </span>
      </span>
      <ToastMini message={archive.themeSaved} />
      <Pointer />
    </span>
  );
};
