// Un contrôle qui paraît et s'efface en largeur et en opacité (Écart §9.3, JOURNAL 2026-10-08) : la corbeille de la pill Dessin
// n'est là que s'il y a un brouillon. Toujours dans la page, `inert` quand il est fermé : ni clavier, ni lecteur d'écran.

import type { ReactNode, TransitionEvent } from "react";
import { classNames } from "./class-names";
import { markMorphing, releaseMorphing } from "./morphing";

type RevealProps = {
  isOpen: boolean;
  isSpread?: boolean; // une rangée dont les contrôles se répartissent sur toute la largeur : il prend sa part, et les autres s'écartent
  children: ReactNode;
};

// Seules ses propres transitions comptent : celles de son contrôle (le survol) remontent jusqu'ici.
const onOwn = (handle: (element: HTMLElement) => void) => (event: TransitionEvent<HTMLElement>) => {
  if (event.target === event.currentTarget) handle(event.currentTarget);
};

const isRunning = (animation: Animation): boolean => animation.playState === "running";

export const Reveal = ({ isOpen, isSpread = false, children }: RevealProps) => (
  <div
    className={classNames("lp-reveal", isSpread && "lp-reveal--spread", isOpen && "is-open")}
    inert={!isOpen}
    onTransitionRun={onOwn(markMorphing)}
    onTransitionEnd={onOwn((element) => releaseMorphing(element, isRunning))}
    onTransitionCancel={onOwn((element) => releaseMorphing(element, isRunning))}
  >
    {isSpread && <span className="lp-spacer" />}
    {children}
  </div>
);
