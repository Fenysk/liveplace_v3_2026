// La page d'une source OBS (§9.1, §9.5) : le store du canvas en mode `obs`, l'image du stream, la surface. Rien
// d'autre : pendant une coupure, la dernière image reste, et la reprise se fait en silence (JOURNAL 2026-09-25).

import { useEffect, useState } from "react";
import type { CanvasOpener } from "../../state/canvas-store";
import { createObsStore, type ObsClock, type ObsStore } from "../../state/obs-store";
import { ObsCanvas } from "./obs-canvas";

const browserClock: ObsClock = {
  now: () => Date.now(),
  wait: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

type ObsPageProps = { canvasId: string; openCanvas: CanvasOpener };

export const ObsPage = ({ canvasId, openCanvas }: ObsPageProps) => {
  const [store, setStore] = useState<ObsStore>();

  // Le WebSocket n'existe que dans le navigateur : tout s'ouvre après le rendu serveur.
  useEffect(() => {
    const canvas = openCanvas(canvasId, "obs");
    const obs = createObsStore(canvas, browserClock);
    setStore(obs);
    return () => {
      obs.dispose();
      canvas.close();
    };
  }, [canvasId, openCanvas]);

  return <main className="lp-obs">{store && <ObsCanvas store={store} />}</main>;
};
