// Suivre le canvas actif (Écart §15, JOURNAL 2026-10-06) : quand le canvas ouvert est archivé, la page du jeu
// ou la vue OBS relit son loader, qui rend le canvas actif, et se rebranche dessus, sans recharger. Tant que le loader rend
// encore l'ancien (Convex n'a pas fini de changer), elle réessaie, de plus en plus lentement.

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useIsCanvasArchived } from "./canvas-status";
import { followDelayMs } from "./follow-delay";

export function useFollowActiveCanvas(canvas: CanvasStore | undefined): void {
  const router = useRouter();
  const isArchived = useIsCanvasArchived(canvas);
  // Le loader de la page seul : la racine ne lit que l'étiquette de la bêta, qui ne change pas.
  const refresh = () => router.invalidate({ filter: ({ routeId }) => routeId !== "__root__" });
  // `refresh` change à chaque rendu : l'effet garde le dernier, sans repartir de zéro.
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  useEffect(() => {
    if (!isArchived) return;
    let attempt = 0;
    let isStopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Si la page a changé de canvas entre-temps, l'effet est déjà arrêté : rien ne repart.
    const schedule = () => {
      if (isStopped) return;
      attempt += 1;
      timer = setTimeout(run, followDelayMs(attempt));
    };
    const run = () => {
      latestRefresh.current().then(schedule, (error: unknown) => {
        console.error("canvas actif : la page n'a pas pu se relire", error);
        schedule();
      });
    };
    timer = setTimeout(run, followDelayMs(0));
    return () => {
      isStopped = true;
      clearTimeout(timer);
    };
  }, [isArchived]);
}
