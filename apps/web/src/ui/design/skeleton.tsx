// Le squelette (CDC 2026, Chargement) : des blocs gris doux à la forme du contenu attendu, à sa taille, pour que rien ne
// saute quand les données arrivent. Fixe, sans boucle. Il ne se montre qu'après 200 ms d'attente (use-skeleton-phase.ts),
// puis le vrai contenu le remplace en fondu. Les blocs sont muets pour un lecteur d'écran : le conteneur dit qu'il charge.

import type { ReactNode } from "react";
import { useTexts } from "../locale/use-locale";
import { classNames } from "./class-names";
import { DESIGN_TEXTS } from "./design-texts";
import { type SkeletonPhase, useSkeletonPhase } from "./use-skeleton-phase";

// La largeur d'une barre est une variante, jamais un `style` (la CSP de production le bloque dans le HTML du serveur).
export type SkeletonWidth = "short" | "medium" | "long";
// Le texte qu'une barre remplace : elle prend sa hauteur de ligne.
export type SkeletonText = "title" | "body" | "caption";
// `avatar` : la photo d'un profil. `swatch` : la pastille de couleur. `field` : un champ de texte.
export type SkeletonShape = "avatar" | "swatch" | "field";

const WIDTH_CLASSES: Record<SkeletonWidth, string> = {
  short: "lp-skeleton-bar--short",
  medium: "lp-skeleton-bar--medium",
  long: "lp-skeleton-bar--long",
};

const TEXT_CLASSES: Record<SkeletonText, string> = {
  title: "lp-type-title",
  body: "lp-type-body",
  caption: "lp-type-caption",
};

const SHAPE_CLASSES: Record<SkeletonShape, string> = {
  avatar: "lp-skeleton-block--avatar",
  swatch: "lp-skeleton-block--swatch",
  field: "lp-skeleton-block--field",
};

type SkeletonBarProps = { text?: SkeletonText; width?: SkeletonWidth };

export const SkeletonBar = ({ text = "body", width = "medium" }: SkeletonBarProps) => (
  <span
    className={classNames("lp-skeleton lp-skeleton-bar", TEXT_CLASSES[text], WIDTH_CLASSES[width])}
    aria-hidden="true"
  />
);

export const SkeletonBlock = ({ shape }: { shape: SkeletonShape }) => (
  <span className={classNames("lp-skeleton", SHAPE_CLASSES[shape])} aria-hidden="true" />
);

// La photo et le nom d'un profil (profile.tsx), à leur écartement.
export const SkeletonProfile = () => (
  <span className="lp-skeleton-profile">
    <SkeletonBlock shape="avatar" />
    <SkeletonBar text="title" width="short" />
  </span>
);

type SkeletonSlotProps = { phase: SkeletonPhase; skeleton: ReactNode; children: ReactNode };

// La place d'un contenu qui charge, d'après sa phase. Le conteneur occupé porte `aria-busy` et le mot « Chargement… »,
// lu à la place des blocs ; `pending` le cache sans le retirer, pour que la place soit déjà prise.
export const SkeletonSlot = ({ phase, skeleton, children }: SkeletonSlotProps) => {
  const design = useTexts(DESIGN_TEXTS);
  if (phase === "ready") return <>{children}</>;
  if (phase === "revealed") return <div className="lp-skeleton-reveal">{children}</div>;
  return (
    <div className={classNames("lp-skeleton-region", phase === "pending" && "is-pending")} aria-busy="true">
      <span className="lp-visually-hidden">{design.loading}</span>
      {skeleton}
    </div>
  );
};

type SkeletonSwapProps = { isLoading: boolean; skeleton: ReactNode; children: ReactNode };

export const SkeletonSwap = ({ isLoading, skeleton, children }: SkeletonSwapProps) => {
  const phase = useSkeletonPhase(isLoading);
  return (
    <SkeletonSlot phase={phase} skeleton={skeleton}>
      {children}
    </SkeletonSlot>
  );
};
