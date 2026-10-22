// Le doigt de la démo : tant que `isEnabled`, il joue les pas de `DEMO_STEPS` un à un, une seule fois. Chaque pas montre
// d'abord l'onde, puis agit. Il s'arrête au premier geste du visiteur, et reprend où il en était si la page le rallume.

import { useEffect, useRef } from "react";
import type { DemoState } from "./home-demo";
import { DEMO_STEPS, type DemoStep, START_DELAY_MS, stepDelayMs, TAP_MS } from "./home-script";

type Autoplay = {
  isEnabled: boolean;
  read: () => DemoState;
  show: (step: DemoStep) => void; // l'onde du doigt
  perform: (step: DemoStep) => void;
};

export const useAutoplay = (autoplay: Autoplay): void => {
  const { isEnabled } = autoplay;
  // Les rappels changent à chaque rendu : l'effet les lit ici, il ne repart pas (et ne perd pas son minutage) à chacun.
  const latest = useRef(autoplay);
  const nextIndex = useRef(0);
  useEffect(() => {
    latest.current = autoplay;
  });
  useEffect(() => {
    if (!isEnabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const step = DEMO_STEPS[nextIndex.current];
      if (step) timer = setTimeout(() => tap(step), stepDelayMs(step, latest.current.read(), Date.now()));
    };
    const tap = (step: DemoStep) => {
      latest.current.show(step);
      timer = setTimeout(() => {
        latest.current.perform(step);
        nextIndex.current += 1;
        schedule();
      }, TAP_MS);
    };
    timer = setTimeout(schedule, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isEnabled]);
};
