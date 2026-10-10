// Le changement de section d'une fenêtre : sa hauteur glisse de l'ancienne à la nouvelle, et le nouveau contenu arrive en fondu.
// Sur la feuille mobile, la hauteur suit le contenu ; sur PC, elle est fixe : seul le fondu se voit.
// Les durées viennent de tokens.css : coupées, rien ne bouge.

import { useLayoutEffect, useRef } from "react";
import { markMorphing, releaseMorphing } from "./morphing";
import { motionEasing, motionMs } from "./motion";

export const SECTION_MORPH_ID = "section-morph";
const isSectionMorph = ({ id }: Animation): boolean => id === SECTION_MORPH_ID;

// Ce que le glissement lit et touche de la fenêtre et de son contenu : de quoi le simuler sans navigateur (use-section-morph.test.ts).
export type SectionMotion = { duration: number; fadeDuration: number; easing: string };
export type HeightAnimation = { playState: string; finished: Promise<unknown>; cancel(): void };
type Animatable = { animate(keyframes: Keyframe[], options: KeyframeAnimationOptions): unknown };
type SectionWindow = {
  offsetHeight: number;
  animate(keyframes: Keyframe[], options: KeyframeAnimationOptions): HeightAnimation;
};

const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

const px = (value: number): string => `${value}px`;

// Appelé quand la section change, son contenu déjà remplacé. `lastHeight` : la hauteur d'avant, que la fenêtre fermée n'a pas (0).
export function morphSection(
  dialog: SectionWindow,
  content: Animatable,
  running: HeightAnimation | undefined,
  lastHeight: number,
  motion: SectionMotion,
): HeightAnimation | undefined {
  // `running` : la fenêtre est à mi-chemin, c'est de là que le suivant repart. Coupé avant la mesure, qui est celle du contenu.
  const from = running ? dialog.offsetHeight : lastHeight;
  running?.cancel();
  const to = dialog.offsetHeight;
  if (from === 0 || to === 0) return undefined;
  if (motion.fadeDuration > 0) content.animate(FADE_IN, { duration: motion.fadeDuration, easing: "ease" });
  if (from === to || motion.duration === 0) return undefined;
  return dialog.animate([{ height: px(from) }, { height: px(to) }], {
    duration: motion.duration,
    easing: motion.easing,
    id: SECTION_MORPH_ID,
  });
}

// Le contenu de la section, dans la fenêtre (`<dialog>`) : le ref va sur lui.
export function useSectionMorph<Content extends HTMLElement>(sectionId: string | undefined) {
  const content = useRef<Content>(null);
  const shown = useRef<{ sectionId: string | undefined }>(undefined);
  const height = useRef(0);
  const glide = useRef<HeightAnimation>(undefined);
  // La hauteur de la fenêtre, tenue à jour : la mesure d'avant le changement se fait après lui.
  useLayoutEffect(() => {
    const dialog = content.current?.closest("dialog");
    if (!dialog) return;
    height.current = dialog.offsetHeight;
    const observer = new ResizeObserver(() => {
      height.current = dialog.offsetHeight;
    });
    observer.observe(dialog);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = content.current;
    const dialog = element?.closest("dialog");
    if (!element || !dialog) return;
    const before = shown.current;
    shown.current = { sectionId };
    if (!before || before.sectionId === sectionId) return;
    const running = glide.current?.playState === "running" ? glide.current : undefined;
    glide.current = morphSection(dialog, element, running, height.current, {
      duration: motionMs(dialog, "--lp-dur"),
      fadeDuration: motionMs(dialog, "--lp-dur-fast"),
      easing: motionEasing(dialog),
    });
    if (glide.current) {
      markMorphing(dialog);
      glide.current.finished.then(
        () => releaseMorphing(dialog, isSectionMorph),
        () => undefined, // coupé par une section plus récente : elle seule libère la fenêtre
      );
    } else releaseMorphing(dialog, isSectionMorph);
  });
  return content;
}
