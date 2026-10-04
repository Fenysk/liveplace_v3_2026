// Suit le statut AdSense d'un `<ins>` : filled / unfilled / timeout / erreur script.

import { type RefObject, useEffect, useState } from "react";
import { getAdSenseLoader } from "./ad-loader";

const FILL_TIMEOUT_MS = 8_000;

export type AdFillPhase = "loading" | "shown" | "empty";

const adStatusOf = (ins: HTMLElement): "filled" | "unfilled" | "pending" => {
  const status = ins.getAttribute("data-ad-status");
  if (status === "filled") return "filled";
  if (status === "unfilled") return "unfilled";
  return "pending";
};

export function useAdFill(insRef: RefObject<HTMLElement | null>, isLive: boolean): AdFillPhase {
  const [phase, setPhase] = useState<AdFillPhase>(isLive ? "loading" : "shown");

  useEffect(() => {
    if (!isLive) return;
    const ins = insRef.current;
    if (!ins) return;
    let isCancelled = false;
    let timeoutId = 0;
    let observer: MutationObserver | undefined;

    const settle = (next: AdFillPhase) => {
      if (isCancelled) return;
      setPhase(next);
      observer?.disconnect();
      window.clearTimeout(timeoutId);
    };

    const watchStatus = () => {
      const status = adStatusOf(ins);
      if (status === "filled") settle("shown");
      else if (status === "unfilled") settle("empty");
    };

    const loader = getAdSenseLoader();
    loader
      .ensureScript()
      .then(() => {
        if (isCancelled) return;
        loader.pushSlot();
        watchStatus();
        if (adStatusOf(ins) !== "pending") return;
        observer = new MutationObserver(watchStatus);
        observer.observe(ins, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-ad-status"],
        });
        timeoutId = window.setTimeout(() => {
          if (adStatusOf(ins) !== "filled") settle("empty");
        }, FILL_TIMEOUT_MS);
      })
      .catch(() => settle("empty"));

    return () => {
      isCancelled = true;
      observer?.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [insRef, isLive]);

  return phase;
}
