// Le morphing des pills (CDC 2026, Principes) : la taille suit le contenu. Quand le contenu change de taille
// (Vue ↔ Dessin, une autre case inspectée, la feuille qui se déplie), la pill glisse de l'ancienne taille à la
// nouvelle, sur la courbe du design system, et le nouveau contenu apparaît en fondu.

import { useEffect, useRef } from "react";
import { MORPHING_SELECTOR } from "./morphing";
import { motionEasing, motionMs } from "./motion";

type BoxSize = { width: number; height: number };

// Ce que le morphing lit et touche d'une pill et de son contenu : de quoi le simuler sans navigateur (use-morph.test.ts).
type MorphAnimation = { finished: Promise<unknown> };
export type MorphPill = { animate(keyframes: Keyframe[], options: KeyframeAnimationOptions): MorphAnimation };
export type MorphContent = {
  offsetWidth: number;
  offsetHeight: number;
  style: { width: string };
  querySelector(selector: string): unknown;
  animate(keyframes: Keyframe[], options: KeyframeAnimationOptions): unknown;
};
export type Motion = { duration: number; fadeDuration: number; easing: string };

// La taille de mise en page, sans les transformations : une pill masquée est réduite par `scale`, pas par sa taille.
const sizeOf = (element: { offsetWidth: number; offsetHeight: number }): BoxSize => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
});

const toKeyframe = ({ width, height }: BoxSize): Keyframe => ({ width: `${width}px`, height: `${height}px` });

// Le rappel du ResizeObserver du contenu. Appelé après la mise en page et avant la peinture : l'ancienne taille est
// rétablie avant d'être vue.
export function createMorph(pill: MorphPill, content: MorphContent, motion: () => Motion): () => void {
  let lastSize = sizeOf(content);
  let pinned: MorphAnimation | undefined;
  // Un contenu large comme la pill (`width: 100%`) suivrait sa largeur animée et relancerait le morphing à chaque image : il garde sa largeur d'arrivée le temps du glissement.
  const pinWidth = (animation: MorphAnimation, width: number) => {
    pinned = animation;
    content.style.width = `${width}px`;
    const release = () => {
      if (pinned !== animation) return;
      pinned = undefined;
      content.style.width = "";
    };
    animation.finished.then(release, release);
  };
  return () => {
    const nextSize = sizeOf(content);
    const from = lastSize;
    lastSize = nextSize;
    if (from.width === nextSize.width && from.height === nextSize.height) return;
    // Un élément dont la taille glisse fait déjà suivre la pill : la rejouer à chaque image la ferait clignoter.
    if (content.querySelector(MORPHING_SELECTOR)) return;
    const { duration, fadeDuration, easing } = motion();
    if (duration === 0) return;
    const animation = pill.animate([toKeyframe(from), toKeyframe(nextSize)], { duration, easing });
    content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeDuration, easing: "ease" });
    // Lu une fois l'animation partie : s'il ne mesure plus sa largeur d'arrivée, il la tient de la pill.
    if (content.offsetWidth !== nextSize.width) pinWidth(animation, nextSize.width);
  };
}

export function useMorph<Pill extends HTMLElement, Content extends HTMLElement>() {
  const pill = useRef<Pill>(null);
  const content = useRef<Content>(null);

  useEffect(() => {
    const pillElement = pill.current;
    const contentElement = content.current;
    if (!pillElement || !contentElement) return;
    const observer = new ResizeObserver(
      createMorph(pillElement, contentElement, () => ({
        duration: motionMs(pillElement, "--lp-dur"),
        fadeDuration: motionMs(pillElement, "--lp-dur-fast"),
        easing: motionEasing(pillElement),
      })),
    );
    observer.observe(contentElement);
    return () => observer.disconnect();
  }, []);

  return { pill, content };
}
