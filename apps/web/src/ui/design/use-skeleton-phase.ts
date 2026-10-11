// Où en est un squelette : il ne se montre qu'après 200 ms d'attente, pour ne pas clignoter sur une réponse rapide.

import { useEffect, useState } from "react";
import { useAfterDelay } from "./use-after-delay";

export const SKELETON_DELAY_MS = 200;

// `ready` : les données sont là. `pending` : elles tardent depuis moins de 200 ms, le squelette garde sa place sans se
// voir. `shown` : il se voit. `revealed` : les données arrivent après qu'il s'est vu, en fondu.
export type SkeletonPhase = "ready" | "pending" | "shown" | "revealed";

// `hasOwnArrival` : le contenu arrive déjà en fondu de lui-même (les lignes d'une liste, arrival.css) : pas de second fondu.
type SkeletonState = { isLoading: boolean; isElapsed: boolean; hasShown: boolean; hasOwnArrival?: boolean };

export const toSkeletonPhase = ({
  isLoading,
  isElapsed,
  hasShown,
  hasOwnArrival = false,
}: SkeletonState): SkeletonPhase => {
  if (isLoading) return isElapsed ? "shown" : "pending";
  return hasShown && !hasOwnArrival ? "revealed" : "ready";
};

export const useSkeletonPhase = (isLoading: boolean, hasOwnArrival = false): SkeletonPhase => {
  const isElapsed = useAfterDelay(isLoading, SKELETON_DELAY_MS);
  const [hasShown, setHasShown] = useState(false);
  // Le squelette s'est-il vu pendant cette attente ? Une nouvelle attente repart de zéro.
  useEffect(() => {
    if (isLoading) setHasShown(isElapsed);
  }, [isLoading, isElapsed]);
  return toSkeletonPhase({ isLoading, isElapsed, hasShown, hasOwnArrival });
};
