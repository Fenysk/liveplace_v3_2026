// Le fond de l'option choisie d'un sélecteur (Segmented, WindowNav, le sommaire de /design) glisse de l'ancienne option à la
// nouvelle, sur la courbe du design system. Ce fond est le `::before` de l'option `.is-selected` (selection-glide.css) : le serveur le
// rend en place et il suit seul une taille qui change. Ici, seulement le trajet : celui de la nouvelle part de la boîte de l'ancienne.
// Les durées viennent de tokens.css : coupées, le fond passe d'un coup.

import { useLayoutEffect, useRef } from "react";
import { motionEasing, motionMs } from "./motion";

const SELECTED = ".is-selected";

type Box = { x: number; y: number; width: number; height: number };

// Ce que le glissement lit et touche d'une option : de quoi le simuler sans navigateur (use-selection-glide.test.ts).
export type GlideOptions = KeyframeAnimationOptions & { pseudoElement: string };
export type GlideAnimation = {
  playState: string;
  effect: { getComputedTiming(): { progress?: number | null } } | null;
  cancel(): void;
};
type Measured = {
  offsetLeft: number;
  offsetTop: number;
  offsetWidth: number;
  offsetHeight: number;
  offsetParent: unknown;
};
export type SelectionElement = Measured & {
  isConnected: boolean;
  animate(keyframes: Keyframe[], options: GlideOptions): GlideAnimation;
};
export type SelectionGlideMotion = { duration: number; easing: string };

type Glide = { animation: GlideAnimation; from: Box; to: Box };
type Seen = { element: SelectionElement; glide?: Glide | undefined };

const isMeasured = (value: unknown): value is Measured =>
  typeof value === "object" && value !== null && "offsetLeft" in value;

// La boîte de mise en page depuis le conteneur, sans les transformations : une fenêtre qui s'ouvre ou un bouton pressé ne la faussent pas.
const boxWithin = (element: Measured, root: object): Box => {
  let x = 0;
  let y = 0;
  for (let node: Measured | undefined = element; node && node !== root; ) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = isMeasured(node.offsetParent) ? node.offsetParent : undefined;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
};

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

// Où est le fond à cet instant du glissement. `progress` est déjà passé par la courbe.
const boxAt = ({ animation, from, to }: Glide): Box => {
  const progress = animation.effect?.getComputedTiming().progress ?? 0;
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
    width: lerp(from.width, to.width, progress),
    height: lerp(from.height, to.height, progress),
  };
};

const isSameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const px = (value: number): string => `${value}px`;

// Le `::before` couvre sa nouvelle option (`inset: 0`) : on le décale sur l'ancienne, puis on étire `right` et `bottom` de l'écart de taille.
const startingKeyframe = (from: Box, to: Box): Keyframe => ({
  transform: `translate(${px(from.x - to.x)}, ${px(from.y - to.y)})`,
  right: px(to.width - from.width),
  bottom: px(to.height - from.height),
});

const RESTING_KEYFRAME: Keyframe = { transform: "translate(0px, 0px)", right: "0px", bottom: "0px" };

// D'où le fond repart : de là où il est s'il glisse encore, sinon de l'option qu'il quitte, si elle est encore dans la page.
const originOf = (seen: Seen | undefined, root: object): Box | undefined => {
  if (!seen) return undefined;
  if (seen.glide?.animation.playState === "running") return boxAt(seen.glide);
  return seen.element.isConnected ? boxWithin(seen.element, root) : undefined;
};

// Appelé après chaque rendu : `seen` dit quelle option était choisie au rendu d'avant, et son glissement.
export function slideSelection(
  root: object,
  selected: SelectionElement | null,
  seen: Seen | undefined,
  motion: () => SelectionGlideMotion,
): Seen | undefined {
  if (seen?.element === selected) return seen;
  const from = originOf(seen, root);
  seen?.glide?.animation.cancel();
  if (!selected) return undefined;
  const to = boxWithin(selected, root);
  if (!from || isSameBox(from, to)) return { element: selected };
  const { duration, easing } = motion();
  if (duration === 0) return { element: selected };
  const animation = selected.animate([startingKeyframe(from, to), RESTING_KEYFRAME], {
    duration,
    easing,
    pseudoElement: "::before",
  });
  return { element: selected, glide: { animation, from, to } };
}

// Le conteneur du sélecteur (`.lp-selection`) : l'option choisie y porte `.is-selected`.
export function useSelectionGlide<Container extends HTMLElement>() {
  const root = useRef<Container>(null);
  const seen = useRef<Seen>(undefined);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    seen.current = slideSelection(
      element,
      element.querySelector<HTMLElement>(SELECTED),
      seen.current,
      () => ({
        duration: motionMs(element, "--lp-dur"),
        easing: motionEasing(element),
      }),
    );
  });
  return root;
}
