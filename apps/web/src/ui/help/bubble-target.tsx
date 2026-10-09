// Là où une bulle d'aide vise (Écart §8.1, JOURNAL 2026-10-08) : un `<span>` autour de l'élément, car `Button` ne transmet pas de `ref`.
// Les refs vivent dans un contexte, que la page de jeu pose : ailleurs (/design, la connexion), l'élément reste seul, sans `<span>`.

import { createContext, createRef, type ReactNode, type RefObject, useContext, useState } from "react";

export type BubbleTargetName =
  | "trace"
  | "submit"
  | "gauge"
  | "claim"
  | "settings"
  | "reports"
  | "obs-tab"
  | "obs-address";

export type BubbleTargets = Record<BubbleTargetName, RefObject<HTMLSpanElement | null>>;

export const BubbleTargetsContext = createContext<BubbleTargets | undefined>(undefined);

const createTargets = (): BubbleTargets => ({
  trace: createRef(),
  submit: createRef(),
  gauge: createRef(),
  claim: createRef(),
  settings: createRef(),
  reports: createRef(),
  "obs-tab": createRef(),
  "obs-address": createRef(),
});

// Une fois par page : les refs ne changent pas, ni le contexte qui les porte.
export const useBubbleTargets = (): BubbleTargets => useState(createTargets)[0];

export const BubbleTarget = ({ name, children }: { name: BubbleTargetName; children: ReactNode }) => {
  const targets = useContext(BubbleTargetsContext);
  if (!targets) return children;
  return (
    <span ref={targets[name]} className="lp-bubble-target">
      {children}
    </span>
  );
};
