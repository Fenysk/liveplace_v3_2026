// Le canvas en plein écran, sous les pills (CDC 2026) : React le monte, la scène le fait vivre sans re-rendu.

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { useDraftKeys } from "../draft/use-draft-keys";
import { type CanvasScene, createCanvasScene } from "./canvas-scene";
import { createViewportSaver, getSavedViewport } from "./saved-viewport";
import type { Framing } from "./viewport";
import { ViewportPill } from "./viewport-pill";

const ZOOM_STEP = 1.5;

// Lu à chaque accès, dans un `try` : dans une fenêtre qui refuse le stockage, l'accès lui-même lève.
const getBrowserStorage = () => window.localStorage;

// `isFramedInFreeArea` (Écart §9.3, JOURNAL 2026-10-08) : la page de jeu, dont l'arrivée se cadre sous ses pills du haut.
type PixelCanvasProps = {
  store: CanvasStore;
  draftStore: DraftStore;
  canvasId: string;
  ownerName: string;
  isFramedInFreeArea?: boolean;
};

export const PixelCanvas = ({
  store,
  draftStore,
  canvasId,
  ownerName,
  isFramedInFreeArea = false,
}: PixelCanvasProps) => {
  const surface = useRef<HTMLCanvasElement>(null);
  const checker = useRef<HTMLDivElement>(null);
  const checkerTiles = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<CanvasScene>();
  const [framing, setFraming] = useState<Framing | null>(null);
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);
  const { inspection, width, height } = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const { mode } = useSyncExternalStore(draftStore.subscribe, draftStore.getView, draftStore.getView);
  const keysHintId = useId();
  // Un seul écouteur du clavier (use-draft-keys.ts) : il reçoit la scène, qui porte la case visée.
  const keyStores = useMemo(() => ({ canvas: store, draft: draftStore }), [store, draftStore]);
  useDraftKeys(keyStores, scene);

  // Le viewport sauvegardé se lit ici, jamais pendant le rendu : `localStorage` n'existe pas sur le serveur.
  useEffect(() => {
    if (!surface.current || !checker.current || !checkerTiles.current) return;
    const saver = createViewportSaver(getBrowserStorage, canvasId);
    const created = createCanvasScene(surface.current, store, draftStore, {
      initialViewport: getSavedViewport(getBrowserStorage, canvasId),
      isFramedInFreeArea,
      onViewportMove: saver.save,
      onFraming: setFraming,
      checker: checker.current,
      checkerTiles: checkerTiles.current,
    });
    setScene(created);
    return () => {
      created.dispose();
      saver.cancel();
    };
  }, [store, draftStore, canvasId, isFramedInFreeArea]);

  return (
    <>
      {/* Empilés en Z (CDC 2026) : le vide, fixe à l'écran, le damier, découpé au canvas, puis le canvas. */}
      <div className="lp-void" aria-hidden="true" />
      <div ref={checker} className="lp-checker" aria-hidden="true">
        <div ref={checkerTiles} className="lp-checker-tiles" />
      </div>
      {/* Audit d'accessibilité, finding 1 : le même motif que l'aperçu de la modération (pixel-preview.tsx). */}
      <canvas
        ref={surface}
        className="lp-canvas"
        role="img"
        aria-label={width > 0 ? `Canvas de ${ownerName}, ${width} × ${height}` : `Canvas de ${ownerName}`}
        aria-describedby={keysHintId}
      />
      {/* Les touches, pour un lecteur d'écran seulement : aucun raccourci ne s'affiche (CDC 2026). */}
      <p id={keysHintId} className="lp-visually-hidden">
        Au clavier : les flèches visent une case, Maj pour aller dix fois plus loin. D, Entrée ou Espace pour
        dessiner. En Dessin : Espace ajoute la case visée, Retour arrière la retire, E prend la gomme, I la
        pipette, Entrée valide, Échap annule.
      </p>
      {scene && (
        <ViewportPill
          framing={framing}
          isCompact={isCompact}
          isSheetOpen={mode === "draft" || inspection !== null}
          onZoomIn={() => scene.zoomBy(ZOOM_STEP)}
          onZoomOut={() => scene.zoomBy(1 / ZOOM_STEP)}
          onRecenter={() => scene.recenter()}
        />
      )}
    </>
  );
};
