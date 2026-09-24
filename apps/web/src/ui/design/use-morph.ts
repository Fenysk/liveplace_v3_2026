// Le morphing des pills (CDC 2026, Principes) : la taille suit le contenu. Quand le contenu change de taille
// (Vue ↔ Dessin, une autre case inspectée, la feuille qui se déplie), la pill glisse de l'ancienne taille à la
// nouvelle, sur la courbe du design system, et le nouveau contenu apparaît en fondu.

import { useEffect, useRef } from "react";
import { motionEasing, motionMs } from "./motion";

type BoxSize = { width: number; height: number };

// La taille de mise en page, sans les transformations : une pill masquée est réduite par `scale`, pas par sa taille.
const sizeOf = (element: HTMLElement): BoxSize => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
});

const toKeyframe = ({ width, height }: BoxSize): Keyframe => ({ width: `${width}px`, height: `${height}px` });

export function useMorph<Pill extends HTMLElement, Content extends HTMLElement>() {
  const pill = useRef<Pill>(null);
  const content = useRef<Content>(null);

  useEffect(() => {
    const pillElement = pill.current;
    const contentElement = content.current;
    if (!pillElement || !contentElement) return;
    let lastSize = sizeOf(contentElement);
    // Appelé après la mise en page et avant la peinture : l'ancienne taille est rétablie avant d'être vue.
    const observer = new ResizeObserver(() => {
      const nextSize = sizeOf(contentElement);
      const from = lastSize;
      lastSize = nextSize;
      if (from.width === nextSize.width && from.height === nextSize.height) return;
      const duration = motionMs(pillElement, "--lp-dur");
      if (duration === 0) return;
      pillElement.animate([toKeyframe(from), toKeyframe(nextSize)], {
        duration,
        easing: motionEasing(pillElement),
      });
      contentElement.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: motionMs(pillElement, "--lp-dur-fast"),
        easing: "ease",
      });
    });
    observer.observe(contentElement);
    return () => observer.disconnect();
  }, []);

  return { pill, content };
}
