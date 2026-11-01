// L'occupation de la boucle d'événements du web (§16.3), par `performance.eventLoopUtilization`.

import { performance } from "node:perf_hooks";

// Chaque appel rend la part du temps passée à travailler, en pourcentage, depuis l'appel précédent.
export function createEventLoopMeter(): () => number {
  let previous = performance.eventLoopUtilization();
  return () => {
    const current = performance.eventLoopUtilization();
    const { utilization } = performance.eventLoopUtilization(current, previous);
    previous = current;
    return utilization * 100;
  };
}
