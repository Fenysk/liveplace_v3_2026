// Ce que montre la pill Inspection d'un rendu à l'autre : un squelette tant que la réponse tarde, puis la case.

import type { Inspection } from "../../state/canvas-store";

export type ShownInspection = Exclude<Inspection, { status: "loading" }>;

// `skeleton` : la case attendue, aux coordonnées qu'on connaît déjà. `isAfterSkeleton` : la case remplace un squelette qui
// s'est vu, elle paraît en fondu.
export type PillContent =
  | { kind: "skeleton"; x: number; y: number }
  | { kind: "cell"; inspection: ShownInspection; isAfterSkeleton: boolean };

export type PillState = { content: PillContent | null; isVisible: boolean };

export const NOTHING_SHOWN: PillState = { content: null, isVisible: false };

// Un squelette qui s'est vu, ou la case déjà montrée sous un fondu, donne une case qui paraît en fondu.
const followsSkeleton = ({ content, isVisible }: PillState, inspection: ShownInspection): boolean => {
  if (content?.kind === "skeleton") return isVisible;
  return content?.kind === "cell" && content.inspection === inspection && content.isAfterSkeleton;
};

// `isWaited` : la réponse se fait attendre depuis plus de 200 ms. La pill ne s'ouvre pas avant, et son ouverture n'attend
// jamais plus ; ouverte, elle garde ce qu'elle montre (case ou squelette) jusqu'à la réponse, comme avant le squelette.
// Fermée, elle garde aussi ce qu'elle emporte en s'effaçant, tant que rien ne s'ouvre.
export const toPillState = (
  inspection: Inspection | null,
  isWaited: boolean,
  previous: PillState,
): PillState => {
  if (inspection === null) return { content: previous.content, isVisible: false };
  if (inspection.status !== "loading") {
    const isAfterSkeleton = followsSkeleton(previous, inspection);
    return { content: { kind: "cell", inspection, isAfterSkeleton }, isVisible: true };
  }
  const skeleton: PillContent = { kind: "skeleton", x: inspection.x, y: inspection.y };
  if (previous.isVisible) return { content: previous.content ?? skeleton, isVisible: true };
  if (isWaited) return { content: skeleton, isVisible: true };
  return { content: previous.content ?? skeleton, isVisible: false };
};
