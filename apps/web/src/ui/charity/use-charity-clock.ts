// L'horloge de la page pour le mode événement : l'heure se met à jour aux instants où l'écran change (le compte à rebours, le début,
// la fin), jamais plus souvent.

import type { CharityEventState } from "@liveplace/protocol";
import { useEffect, useState } from "react";
import { charityRecheckDelayMs } from "../../state/charity-event";

export const useCharityClock = (state: CharityEventState | undefined): number => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const delay = charityRecheckDelayMs(state, nowMs);
    if (delay === null) return;
    const timer = setTimeout(() => setNowMs(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [state, nowMs]);
  return nowMs;
};
