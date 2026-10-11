// Un nombre dont les chiffres défilent quand il change : seuls ceux qui diffèrent bougent, vers le haut
// quand le nombre monte, vers le bas quand il descend. Au premier affichage, et avec `prefers-reduced-motion`, il change d'un coup.
// `value` est déjà au format de la langue : les séparateurs et les unités restent fixes. Un lecteur d'écran lit la valeur
// finale, une fois ; les chiffres dessinés pour les yeux lui sont cachés.

import { useLayoutEffect, useRef } from "react";
import { motionEasing, motionMs } from "./motion";
import {
  type Dial,
  type Glyph,
  type Part,
  type Piece,
  planRolls,
  type Roll,
  rollDial,
  toParts,
} from "./roll-digits";

type RollingNumberProps = { value: string };

const glyphOf = (element: HTMLElement): Glyph => ({
  animate: (keyframes, motion) => element.animate(keyframes, motion),
  running: () => element.getAnimations(),
  look: () => {
    const { transform, opacity } = getComputedStyle(element);
    return { transform, opacity };
  },
  remove: () => element.remove(),
});

// Le chiffre qui s'en va est posé par-dessus l'affiché, dans la même fenêtre ; React ne touche jamais au cadran, seulement au texte affiché.
const dialOf = (element: HTMLElement): Dial | undefined => {
  const shown = element.querySelector<HTMLElement>(":scope > .lp-roll-shown");
  if (!shown) return undefined;
  return {
    shown: glyphOf(shown),
    leaving: () => {
      const leaving = element.querySelector<HTMLElement>(":scope > .lp-roll-leaving");
      return leaving ? glyphOf(leaving) : undefined;
    },
    leave: (digit) => {
      const leaving = document.createElement("span");
      leaving.className = "lp-roll-leaving";
      leaving.textContent = digit;
      element.append(leaving);
      return glyphOf(leaving);
    },
  };
};

function rollNumber(root: HTMLElement, rolls: readonly Roll[]): void {
  const duration = motionMs(root, "--lp-dur");
  if (duration === 0) return;
  const motion = { duration, easing: motionEasing(root) };
  const dials = root.querySelectorAll<HTMLElement>(".lp-roll-dial");
  for (const roll of rolls) {
    const element = dials[dials.length - 1 - roll.fromRight];
    const dial = element && dialOf(element);
    if (dial) rollDial(dial, roll, motion);
  }
}

const PieceView = ({ piece }: { piece: Piece }) =>
  piece.kind === "digit" ? (
    <span className="lp-roll-dial">
      <span className="lp-roll-shown">{piece.digit}</span>
    </span>
  ) : (
    piece.text
  );

const PartView = ({ part }: { part: Part }) =>
  part.kind === "number" ? (
    <span className="lp-roll-number">
      {part.pieces.map((piece) => (
        <PieceView key={piece.key} piece={piece} />
      ))}
    </span>
  ) : (
    part.text
  );

export const RollingNumber = ({ value }: RollingNumberProps) => {
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef<string>(undefined);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (root.current && before !== undefined && before !== value)
      rollNumber(root.current, planRolls(before, value));
  }, [value]);
  return (
    <span ref={root} className="lp-rolling">
      <span className="lp-visually-hidden">{value}</span>
      <span className="lp-rolling-visual" aria-hidden="true">
        {toParts(value).map((part) => (
          <PartView key={part.key} part={part} />
        ))}
      </span>
    </span>
  );
};
