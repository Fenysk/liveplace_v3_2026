// Le libellé d'un bouton qui change (Écart §9.3, JOURNAL 2026-10-08) : sa largeur glisse de l'ancienne à la nouvelle, et
// son contenu passe en fondu quand ses mots changent, pas quand ses chiffres seuls changent (un compte à rebours ne clignote pas).
// Les durées viennent de tokens.css : coupées, rien ne bouge.

import { useEffect, useLayoutEffect, useRef } from "react";
import { markMorphing, releaseMorphing } from "./morphing";
import { motionEasing, motionMs } from "./motion";

const MORPH_ANIMATION_ID = "label-morph";
const isLabelMorph = ({ id }: Animation): boolean => id === MORPH_ANIMATION_ID;

// « Valider · 3 » et « Valider · 4 » disent les mêmes mots.
export const wordingOf = (label: string): string => label.replaceAll(/\d+/g, "0");

type Seen = { label: string; width: number; animation?: Animation | undefined };

const glide = (element: HTMLElement, from: number, to: number): Animation => {
  markMorphing(element);
  const animation = element.animate([{ width: `${from}px` }, { width: `${to}px` }], {
    duration: motionMs(element, "--lp-dur"),
    easing: motionEasing(element),
  });
  animation.id = MORPH_ANIMATION_ID;
  animation.finished.then(
    () => releaseMorphing(element, isLabelMorph),
    () => undefined, // annulée par un libellé plus récent : lui seul libère le bouton
  );
  return animation;
};

const fadeIn = (element: HTMLElement): void => {
  const duration = motionMs(element, "--lp-dur-fast");
  for (const child of element.children)
    child.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease" });
};

// De la largeur d'avant à celle d'après : elle glisse, sauf sans mouvement ou sans écart.
const slide = (element: HTMLElement, label: string, from: number | undefined, to: number): Seen => {
  if (from === undefined || from === to || motionMs(element, "--lp-dur") === 0) {
    releaseMorphing(element, isLabelMorph);
    return { label, width: to };
  }
  return { label, width: to, animation: glide(element, from, to) };
};

const runningOf = (seen: Seen | undefined): Animation | undefined =>
  seen?.animation?.playState === "running" ? seen.animation : undefined;

// Appelé après chaque rendu : la largeur vue reste fraîche, même si la police arrive après le premier.
const settle = (element: HTMLElement, label: string, seen: Seen | undefined): Seen => {
  const running = runningOf(seen);
  if (seen && seen.label === label) return running ? seen : { label, width: element.offsetWidth };
  // `running` : le bouton est à mi-chemin, c'est de là que le suivant repart.
  const from = running ? element.offsetWidth : seen?.width;
  running?.cancel();
  if (
    from !== undefined &&
    motionMs(element, "--lp-dur") > 0 &&
    wordingOf(seen?.label ?? "") !== wordingOf(label)
  )
    fadeIn(element);
  return slide(element, label, from, element.offsetWidth);
};

// Le libellé n'a pas changé mais la largeur oui : un mot qui paraît ou cède à l'écran qui tourne ou se redimensionne.
const refit = (element: HTMLElement, seen: Seen | undefined): Seen | undefined =>
  !seen || runningOf(seen) ? seen : slide(element, seen.label, seen.width, element.offsetWidth);

export function useLabelMorph(label: string | undefined, isEnabled: boolean) {
  const button = useRef<HTMLButtonElement>(null);
  const seen = useRef<Seen>(undefined);
  useLayoutEffect(() => {
    const element = button.current;
    if (!isEnabled || !element || label === undefined) return;
    seen.current = settle(element, label, seen.current);
  });
  // L'événement part avant la mise en page : le bouton repart de sa largeur d'avant, et la pill n'a rien vu changer.
  useEffect(() => {
    const element = button.current;
    if (!isEnabled || !element) return;
    const onResize = () => {
      seen.current = refit(element, seen.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isEnabled]);
  return button;
}
