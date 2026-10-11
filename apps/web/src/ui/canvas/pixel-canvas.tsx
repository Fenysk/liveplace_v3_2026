// Le canvas en plein écran, sous les pills (CDC 2026) : React le monte, la scène le fait vivre sans re-rendu.

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { useDraftKeys } from "../draft/use-draft-keys";
import { useTexts } from "../locale/use-locale";
import { type CanvasScene, createCanvasScene, type Handoff } from "./canvas-scene";
import { CANVAS_TEXTS } from "./canvas-texts";
import type { NavigationKind } from "./navigation-watch";
import { createViewportSaver, getSavedViewport } from "./saved-viewport";
import type { Framing } from "./viewport";
import { ViewportPill } from "./viewport-pill";

const ZOOM_STEP = 1.5;

// Lu à chaque accès, dans un `try` : dans une fenêtre qui refuse le stockage, l'accès lui-même lève.
const getBrowserStorage = () => window.localStorage;

// `isFramedInFreeArea` (Écart §9.3, JOURNAL 2026-10-08) : la page de jeu, dont l'arrivée se cadre sous ses pills du haut.
// `onGesture` (Écart §8.1, JOURNAL 2026-10-08) : une action reconnue (déplacer, zoomer, ouvrir une case) ; stable, la scène est recréée sinon.
// `onNavigate` (Écart §8.1, JOURNAL 2026-10-08) : un déplacement ou un zoom réussi, pour le conseil de première visite.
// `login` (Écart §9.1, JOURNAL 2026-10-10) : celui de la page, qui nomme l'adresse de l'image du fond.
// `handoff` : la page de jeu, qui suit une autre fresque quand le streamer archive, garde l'ancienne à l'écran le temps que la nouvelle arrive.
type PixelCanvasProps = {
  store: CanvasStore;
  draftStore: DraftStore;
  canvasId: string;
  login: string;
  ownerName: string;
  isFramedInFreeArea?: boolean;
  onGesture?: () => void;
  onNavigate?: (kind: NavigationKind) => void;
  handoff?: Handoff;
};

const doNothing = (): void => undefined;

export const PixelCanvas = ({
  store,
  draftStore,
  canvasId,
  login,
  ownerName,
  isFramedInFreeArea = false,
  onGesture = doNothing,
  onNavigate,
  handoff,
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
  const t = useTexts(CANVAS_TEXTS);
  // Relu à chaque geste : changer de fonction ne refait pas la scène, qui perdrait sa vue.
  const navigated = useRef(onNavigate);
  navigated.current = onNavigate;
  // Un seul écouteur du clavier (use-draft-keys.ts) : il reçoit la scène, qui porte la case visée.
  const keyStores = useMemo(() => ({ canvas: store, draft: draftStore }), [store, draftStore]);
  useDraftKeys(keyStores, scene);

  // Le viewport sauvegardé se lit ici, jamais pendant le rendu : `localStorage` n'existe pas sur le serveur.
  useEffect(() => {
    if (!surface.current || !checker.current || !checkerTiles.current) return;
    const saver = createViewportSaver(getBrowserStorage, canvasId);
    const created = createCanvasScene(surface.current, store, draftStore, {
      login,
      initialViewport: getSavedViewport(getBrowserStorage, canvasId),
      isFramedInFreeArea,
      onNavigate: (kind) => navigated.current?.(kind),
      onViewportMove: saver.save,
      onFraming: setFraming,
      onGesture,
      handoff,
      checker: checker.current,
      checkerTiles: checkerTiles.current,
    });
    setScene(created);
    return () => {
      created.dispose();
      saver.cancel();
    };
  }, [store, draftStore, canvasId, login, isFramedInFreeArea, onGesture, handoff]);

  return (
    <>
      {/* Empilés en Z (CDC 2026) : le vide, fixe à l'écran, le damier, découpé au canvas, puis le canvas. */}
      <div className="lp-void" aria-hidden="true" />
      <div ref={checker} className="lp-checker" aria-hidden="true">
        <div ref={checkerTiles} className="lp-checker-tiles" />
      </div>
      {/* Les zones libres du canvas, que le CSS dessine et que le cadrage d'arrivée mesure (arrival-insets.ts) : à côté de la colonne, au-dessus. */}
      <div className="lp-canvas-zone" aria-hidden="true" />
      <div className="lp-canvas-zone lp-canvas-zone--above" aria-hidden="true" />
      {/* Audit d'accessibilité, finding 1 : le même motif que l'aperçu de la modération (pixel-preview.tsx). */}
      <canvas
        ref={surface}
        className="lp-canvas"
        role="img"
        aria-label={t.surfaceLabel({ ownerName, size: width > 0 ? { width, height } : undefined })}
        aria-describedby={keysHintId}
      />
      {/* Les touches, pour un lecteur d'écran seulement : aucun raccourci ne s'affiche (CDC 2026). */}
      <p id={keysHintId} className="lp-visually-hidden">
        {t.keysHint}
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
