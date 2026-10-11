// La surface de la vue OBS (CDC 2026, Vue OBS) : les pixels seuls, sur le fond de la fresque (transparent, noir ou blanc) et son image
// (Écart §9.1, JOURNAL 2026-10-10). Le canvas remplit la source sans se déformer, centré : une case peut faire 4 px et sa voisine
// 5 px (JOURNAL 2026-09-25). Ni geste, ni curseur. Le dessin et ses animations sont dans obs-scene.ts.

import { useEffect, useRef } from "react";
import type { ObsStore } from "../../state/obs-store";
import { createHandoff } from "../canvas/handoff";
import { useTexts } from "../locale/use-locale";
import { createObsScene } from "./obs-scene";
import { OBS_TEXTS } from "./obs-texts";

// `login` : celui de la page, qui nomme l'adresse de l'image du fond.
type ObsCanvasProps = { store: ObsStore; login: string };

export const ObsCanvas = ({ store, login }: ObsCanvasProps) => {
  const surface = useRef<HTMLCanvasElement>(null);
  // La surface sert aussi la fresque suivante (la source suit le canvas actif) : la scène qui s'en va lui laisse ce qu'elle montrait.
  const handoff = useRef(createHandoff());
  const t = useTexts(OBS_TEXTS);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const scene = createObsScene(element, store, { login, handoff: handoff.current });
    return () => scene.dispose();
  }, [store, login]);

  return <canvas ref={surface} className="lp-obs-surface" aria-label={t.surfaceLabel} />;
};
