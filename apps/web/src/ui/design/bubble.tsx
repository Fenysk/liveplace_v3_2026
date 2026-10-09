// La bulle (Écart §8.1, JOURNAL 2026-10-08) : une surface de pill sans action qui guide un geste, avec un contenu libre.
// Sans cible, elle se pose au-dessus de la barre du bas ; avec une cible, contre la pill qui la porte, et une flèche la vise.
// Elle ne se montre qu'une fois : `useSeenBubble` la retient, et c'est l'appelant qui décide de quand l'afficher.

import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { type BubbleSide, isInsideClips, placeBubble, type TargetRect } from "./bubble-position";
import type { ButtonIcon } from "./button";
import { classNames } from "./class-names";
import { motionMs } from "./motion";
import { Pill } from "./pill";

type BubbleProps = {
  isVisible: boolean; // elle paraît et s'efface en fondu ; jamais montrée, elle n'est pas même dans la page
  target?: RefObject<HTMLElement | null> | undefined; // l'élément visé : la bulle se pose contre sa pill, la flèche le pointe
  isDocked?: boolean; // absent : posée sur place, comme sur /design
  side?: BubbleSide; // posée sur place seulement : de quel côté de la cible elle est ; absent : au-dessus
  sides?: readonly BubbleSide[]; // posée sur l'écran seulement : les côtés essayés, dans l'ordre (une constante) ; absent : tous
  isOverWindow?: boolean; // Écart §8.1 (JOURNAL 2026-10-09) : dans une fenêtre ouverte, par-dessus elle, contre l'élément visé
  children: ReactNode;
};

const SPACE_VARIABLE = "--space-2";
const SPACE_SMALL_VARIABLE = "--space-1";
const PILL_SELECTOR = ".lp-pill";
const DOCK_SELECTOR = "[data-dock]";
const WINDOW_SELECTOR = "dialog";

// Le dock de la pill visée : le CSS fait suivre à la bulle les pills du haut quand elles s'effacent (pill.css).
const AIMED_DOCK_ATTRIBUTE = "data-aimed-dock";
// L'élément visé est sorti du cadre qui le rogne (le corps de la fenêtre a défilé) : le CSS efface la bulle avec lui.
const CLIPPED_ATTRIBUTE = "data-clipped";

const setVariable = (element: HTMLElement, name: string, pixels: number) =>
  element.style.setProperty(name, `${pixels}px`);

const getSpace = (style: CSSStyleDeclaration, variable: string): number =>
  Number.parseFloat(style.getPropertyValue(variable)) || 0;

const isVertical = (side: BubbleSide): boolean => side === "above" || side === "below";

// La flèche se tourne vers la cible le long du bord de la bulle qu'elle longe : le haut ou le bas la place en x, un côté en y.
const setArrow = (element: HTMLElement, side: BubbleSide, pixels: number) =>
  setVariable(element, isVertical(side) ? "--lp-bubble-arrow-x" : "--lp-bubble-arrow-y", pixels);

// Un `DOMRect` ne se déplie pas (ses mesures sont des accesseurs) : les mesures s'écrivent une à une.
const rectOf = (element: Element): TargetRect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

type Docking = { sides: readonly BubbleSide[] | undefined; isOverWindow: boolean };

// Posée sur l'écran : la bulle se pose contre la pill qui porte la cible, sans la couvrir, du côté où elle tient ;
// sa flèche vise la cible. Écart §8.1 (JOURNAL 2026-10-08). Dans une fenêtre, cette pill est la fenêtre entière : contre la cible
// elle-même (JOURNAL 2026-10-09).
const dockAtTarget = (element: HTMLElement, aimed: HTMLElement, { sides, isOverWindow }: Docking) => {
  const pill = element.firstElementChild;
  if (!(pill instanceof HTMLElement)) return;
  const style = getComputedStyle(element);
  const margin = getSpace(style, SPACE_VARIABLE);
  const anchor = isOverWindow ? aimed : (aimed.closest(PILL_SELECTOR) ?? aimed);
  const placement = placeBubble(
    rectOf(aimed),
    rectOf(anchor),
    { width: pill.offsetWidth, height: pill.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    margin,
    margin + getSpace(style, SPACE_SMALL_VARIABLE),
    sides,
  );
  element.dataset.side = placement.side;
  const dock = anchor.closest<HTMLElement>(DOCK_SELECTOR)?.dataset.dock;
  if (dock) element.setAttribute(AIMED_DOCK_ATTRIBUTE, dock);
  setVariable(element, "--lp-bubble-left", placement.left);
  setVariable(element, "--lp-bubble-top", placement.top);
  setArrow(element, placement.side, placement.arrow);
};

// Les cadres qui rognent l'élément visé, jusqu'à sa fenêtre comprise : le corps qui défile, la rangée d'onglets, la fenêtre.
const clipsOf = (aimed: HTMLElement): TargetRect[] => {
  const clips: TargetRect[] = [];
  const dialog = aimed.closest(WINDOW_SELECTOR);
  for (let ancestor = aimed.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(ancestor);
    if (overflowX !== "visible" || overflowY !== "visible") clips.push(rectOf(ancestor));
    if (ancestor === dialog) break;
  }
  return clips;
};

// Posée sur place : seule la flèche se tourne vers la cible.
const aimArrowAtTarget = (element: HTMLElement, rect: DOMRect, side: BubbleSide) => {
  const own = element.getBoundingClientRect();
  setArrow(
    element,
    side,
    isVertical(side) ? rect.left + rect.width / 2 - own.left : rect.top + rect.height / 2 - own.top,
  );
};

type Following = Docking & { isDocked: boolean; side: BubbleSide };

// Suit la cible : taille de la cible ou de la bulle, écran, ou pill qui publie sa taille sur <html> (pill.tsx).
// Une feuille qui se déplie glisse jusqu'à sa place : la cible se relit une fois de plus la durée du morphing après.
// Dans une fenêtre (JOURNAL 2026-10-09), chaque défilement relit la cible : la bulle s'efface si elle sort de son cadre.
const followTarget = (
  element: HTMLElement,
  target: RefObject<HTMLElement | null>,
  { isDocked, side, sides, isOverWindow }: Following,
): (() => void) => {
  let settling: ReturnType<typeof setTimeout> | undefined;
  let scrolling: number | undefined;
  let observed: HTMLElement | null = null;
  const resizing = new ResizeObserver(() => settle());
  // La cible se monte parfois après la bulle : elle ne se suit qu'à partir du moment où on la trouve.
  const observe = (aimed: HTMLElement) => {
    if (aimed === observed) return;
    if (observed) resizing.unobserve(observed);
    resizing.observe(aimed);
    observed = aimed;
  };
  const measure = () => {
    const aimed = target.current;
    if (!aimed) return;
    observe(aimed);
    if (isDocked) dockAtTarget(element, aimed, { sides, isOverWindow });
    else aimArrowAtTarget(element, aimed.getBoundingClientRect(), side);
    if (isOverWindow)
      element.toggleAttribute(CLIPPED_ATTRIBUTE, !isInsideClips(rectOf(aimed), clipsOf(aimed)));
    element.dataset.positioned = "";
  };
  const settle = () => {
    measure();
    clearTimeout(settling);
    settling = setTimeout(measure, motionMs(element, "--lp-dur"));
  };
  const scroll = () => {
    scrolling ??= requestAnimationFrame(() => {
      scrolling = undefined;
      measure();
    });
  };
  // Une rangée d'onglets déborde parfois de la feuille : l'onglet visé revient à la vue avant que la flèche le vise.
  if (isOverWindow) target.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  resizing.observe(element);
  settle();
  const publishing = new MutationObserver(settle);
  publishing.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  window.addEventListener("resize", settle);
  // Un défilement ne remonte pas : seule la capture l'attrape, d'où qu'il vienne.
  if (isOverWindow) document.addEventListener("scroll", scroll, { capture: true, passive: true });
  return () => {
    clearTimeout(settling);
    if (scrolling !== undefined) cancelAnimationFrame(scrolling);
    resizing.disconnect();
    publishing.disconnect();
    window.removeEventListener("resize", settle);
    document.removeEventListener("scroll", scroll, { capture: true });
  };
};

const useBubblePosition = (
  box: RefObject<HTMLDivElement | null>,
  target: RefObject<HTMLElement | null> | undefined,
  { isDocked, side, sides, isOverWindow }: Following,
  isActive: boolean,
) => {
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !target || !isActive) return;
    return followTarget(element, target, { isDocked, side, sides, isOverWindow });
  }, [box, target, isDocked, side, sides, isOverWindow, isActive]);
};

// Écart §8.1 (JOURNAL 2026-10-09) : une fenêtre modale couvre tout hors de la couche supérieure du navigateur, quel que soit le
// `z-index`. La bulle y monte après la fenêtre (`popover` natif), donc au-dessus, et redescend après son fondu.
const useTopLayer = (box: RefObject<HTMLDivElement | null>, isOverWindow: boolean, isVisible: boolean) => {
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !isOverWindow || typeof element.showPopover !== "function") return;
    if (isVisible) {
      // Déjà montée, elle redescend d'abord : remonter la remet au-dessus d'une fenêtre ouverte depuis.
      if (element.matches(":popover-open")) element.hidePopover();
      element.showPopover();
      return;
    }
    const leaving = setTimeout(
      () => {
        if (element.matches(":popover-open")) element.hidePopover();
      },
      motionMs(element, "--lp-dur-fade"),
    );
    return () => clearTimeout(leaving);
  }, [box, isOverWindow, isVisible]);
};

export const Bubble = ({
  isVisible,
  target,
  isDocked = true,
  side = "above",
  sides,
  isOverWindow = false,
  children,
}: BubbleProps) => {
  const box = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);
  if (isVisible && !hasBeenVisible) setHasBeenVisible(true);
  // Dans la couche supérieure avant d'être posée : mesurer la bulle demande qu'elle soit affichée.
  useTopLayer(box, isOverWindow, isVisible);
  useBubblePosition(box, target, { isDocked, side, sides, isOverWindow }, isVisible);
  if (!hasBeenVisible) return null;
  return (
    <div
      ref={box}
      // Posée sur l'écran, le côté se pose côté client avec le reste (`dockAtTarget`) : il n'est pas rendu par le serveur.
      data-side={isDocked ? undefined : side}
      popover={isOverWindow ? "manual" : undefined}
      className={classNames(
        "lp-bubble",
        isDocked && "lp-floating",
        target && "lp-bubble--pointing",
        !isVisible && "is-hidden",
      )}
    >
      <Pill layout="stack" isVisible={isVisible}>
        <div className="lp-bubble-body">{children}</div>
      </Pill>
      {target && <span className="lp-bubble-arrow" aria-hidden="true" />}
    </div>
  );
};

// Une ligne de la bulle : une icône, et ce qu'elle dit.
export const BubbleLine = ({ icon: Icon, children }: { icon: ButtonIcon; children: ReactNode }) => (
  <p className="lp-bubble-line lp-type-caption">
    <Icon aria-hidden="true" />
    <span>{children}</span>
  </p>
);
