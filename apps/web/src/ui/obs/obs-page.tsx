// La page d'une source OBS (§9.1, §9.5) : le store du canvas en mode `obs`, l'image du stream, la surface. Rien
// d'autre : pendant une coupure, la dernière image reste, et la reprise se fait en silence (JOURNAL 2026-09-25).
// Quand le streamer archive, la source suit seule le nouveau canvas actif, sans rien changer dans OBS
// (Écart §15, JOURNAL 2026-10-06).

import { useEffect, useState } from "react";
import type { CanvasOpener, CanvasStore } from "../../state/canvas-store";
import { createObsStore, type ObsClock, type ObsStore } from "../../state/obs-store";
import { useFollowActiveCanvas } from "../canvas/use-follow-active-canvas";
import { ObsCanvas } from "./obs-canvas";

const browserClock: ObsClock = {
  now: () => Date.now(),
  wait: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

type ObsPageProps = { canvasId: string; openCanvas: CanvasOpener };

type Stores = { canvas: CanvasStore; obs: ObsStore };

export const ObsPage = ({ canvasId, openCanvas }: ObsPageProps) => {
  const [stores, setStores] = useState<Stores>();
  useFollowActiveCanvas(stores?.canvas);

  // Le WebSocket n'existe que dans le navigateur : tout s'ouvre après le rendu serveur.
  useEffect(() => {
    const canvas = openCanvas(canvasId, "obs");
    const obs = createObsStore(canvas, browserClock);
    setStores({ canvas, obs });
    return () => {
      obs.dispose();
      canvas.close();
    };
  }, [canvasId, openCanvas]);

  return <main className="lp-obs">{stores && <ObsCanvas store={stores.obs} />}</main>;
};
