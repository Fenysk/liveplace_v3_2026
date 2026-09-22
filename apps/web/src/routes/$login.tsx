// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { CanvasStore } from "../state/canvas-store";
import { AccountLink } from "../ui/canvas/account-link";
import { CanvasStatus } from "../ui/canvas/canvas-status";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";
import { resolveCanvas } from "../usecase/resolve-canvas";

// Une seule couleur au J7 (CDC §4, « une grille, un clic, une couleur ») ; la palette arrive au J10.
const PLACED_COLOR_INDEX = 7;

// Toujours exécutée sur le serveur, où que tourne le loader : la clé de Convex n'en sort jamais.
const getCanvasPage = createServerFn({ method: "GET" })
  .validator((login: string) => login)
  .handler(({ data: login, context }) => resolveCanvas(context.deps.durable, login));

const CanvasPage = () => {
  const { canvasId, displayName } = Route.useLoaderData();
  const { login } = Route.useParams();
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
      <h1 style={{ margin: 0, fontSize: 18 }}>{displayName}</h1>
      {store ? (
        <>
          <PixelCanvas store={store} colorIndex={PLACED_COLOR_INDEX} />
          <CanvasStatus store={store} />
          <AccountLink store={store} login={login} />
        </>
      ) : (
        <p>Connexion…</p>
      )}
    </main>
  );
};

const CanvasNotFound = () => (
  <main style={{ padding: 16, display: "grid", gap: 12, justifyItems: "center" }}>
    <p style={{ margin: 0 }}>Ce pseudo n'a pas encore de canvas sur LivePlace.</p>
    <a href="/auth/twitch" style={{ color: "#c9b6ff" }}>
      Se connecter avec Twitch
    </a>
  </main>
);

export const Route = createFileRoute("/$login")({
  loader: async ({ params }) => {
    const page = await getCanvasPage({ data: params.login });
    if (!page) throw notFound();
    return page;
  },
  // OBS Studio met les pages en cache (§9.1, §13).
  headers: () => ({ "Cache-Control": "no-store" }),
  component: CanvasPage,
  notFoundComponent: CanvasNotFound,
});
