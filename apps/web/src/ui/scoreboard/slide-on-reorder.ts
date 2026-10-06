// Un avatar qui change de place glisse de l'ancienne à la nouvelle (JOURNAL 2026-10-06) : on mesure les lignes avant
// et après, puis on les rejoue de l'écart vers zéro. Les durées viennent de tokens.css : coupées, rien ne bouge.

import { type RefObject, useLayoutEffect, useRef } from "react";
import { motionEasing, motionMs } from "../design/motion";

// La ligne que l'on suit : posée sur chaque `li`.
const SLIDE_KEY = "data-slide-key";
export const slideKeyProps = (key: string) => ({ [SLIDE_KEY]: key });

type Slide = { key: string; offsetY: number };

// De l'ancienne hauteur à la nouvelle : ce qui arrive, part ou ne bouge pas ne glisse pas.
export function toSlides(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): Slide[] {
  return [...after].flatMap(([key, top]) => {
    const previous = before.get(key);
    return previous === undefined || previous === top ? [] : [{ key, offsetY: previous - top }];
  });
}

// `offsetTop` ignore les transformations : un glissement en cours ne fausse pas la mesure.
const measureRows = (list: HTMLElement) =>
  [...list.querySelectorAll<HTMLElement>(`[${SLIDE_KEY}]`)].map((element) => ({
    key: element.getAttribute(SLIDE_KEY) ?? "",
    element,
    top: element.offsetTop,
  }));

// `isCollapsed` : à son changement, les hauteurs sont neuves (la liste change de forme), rien ne glisse.
export function useSlideOnReorder(list: RefObject<HTMLElement | null>, isCollapsed: boolean): void {
  const previous = useRef<{ tops: ReadonlyMap<string, number>; isCollapsed: boolean }>({
    tops: new Map(),
    isCollapsed,
  });
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const rows = measureRows(element);
    const tops = new Map(rows.map(({ key, top }) => [key, top]));
    const duration = motionMs(element, "--lp-dur");
    if (duration > 0 && previous.current.isCollapsed === isCollapsed)
      for (const { key, offsetY } of toSlides(previous.current.tops, tops))
        rows
          .find((row) => row.key === key)
          ?.element.animate([{ transform: `translateY(${offsetY}px)` }, { transform: "none" }], {
            duration,
            easing: motionEasing(element),
          });
    previous.current = { tops, isCollapsed };
  });
}
