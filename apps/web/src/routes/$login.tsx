// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CanvasStore } from "../state/canvas-store";
import { CanvasStatus } from "../ui/canvas/canvas-status";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";

// Une seule couleur au J7 (CDC §4, « une grille, un clic, une couleur ») ; la palette arrive au J10.
const PLACED_COLOR_INDEX = 7;

const CanvasPage = () => {
  const { canvasId } = Route.useLoaderData();
  const { openCanvas } = Route.useRouteContext();
  const [store, setStore] = useState<CanvasStore>();

  // Le WebSocket n'existe que dans le navigateur : la connexion s'ouvre après le rendu serveur.
  useEffect(() => {
    const opened = openCanvas(canvasId);
    setStore(opened);
    return () => opened.close();
  }, [canvasId, openCanvas]);

  return (
    <main style={{ padding: 16, display: "grid", gap: 12, justifyItems: "center" }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>{canvasId}</h1>
      {store ? (
        <>
          <PixelCanvas store={store} colorIndex={PLACED_COLOR_INDEX} />
          <CanvasStatus store={store} />
        </>
      ) : (
        <p>Connexion…</p>
      )}
    </main>
  );
};

export const Route = createFileRoute("/$login")({
  // Écart §9.1 (JOURNAL 2026-09-19) : Convex résoudra le pseudo en canvas au J8.
  loader: ({ params }) => ({ canvasId: params.login }),
  component: CanvasPage,
});
