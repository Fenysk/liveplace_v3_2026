// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { CanvasStore } from "../state/canvas-store";
import { createDraftStore, type DraftClock, type DraftStore } from "../state/draft-store";
import { AccountLink } from "../ui/canvas/account-link";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";
import { Pill } from "../ui/design/pill";
import { DraftPill } from "../ui/draft/draft-pill";
import { useDraftKeys } from "../ui/draft/use-draft-keys";
import { InspectionPill } from "../ui/inspection/inspection-pill";
import { resolveCanvas } from "../usecase/resolve-canvas";

// Toujours exécutée sur le serveur, où que tourne le loader : la clé de Convex n'en sort jamais.
const getCanvasPage = createServerFn({ method: "GET" })
  .validator((login: string) => login)
  .handler(({ data: login, context }) => resolveCanvas(context.deps.durable, login));

// Lu à chaque accès : dans une fenêtre qui refuse le stockage, l'accès lui-même lève (le brouillon l'attrape).
const getBrowserStorage = () => window.localStorage;
const browserClock: DraftClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Stores = { canvas: CanvasStore; draft: DraftStore };

const CanvasPage = () => {
  const { canvasId, displayName } = Route.useLoaderData();
  const { login } = Route.useParams();
  const { openCanvas } = Route.useRouteContext();
  const [stores, setStores] = useState<Stores>();

  // Le WebSocket et le stockage n'existent que dans le navigateur : tout s'ouvre après le rendu serveur.
  useEffect(() => {
    const canvas = openCanvas(canvasId);
    const draft = createDraftStore(canvasId, canvas, getBrowserStorage, browserClock);
    setStores({ canvas, draft });
    return () => {
      draft.dispose();
      canvas.close();
    };
  }, [canvasId, openCanvas]);

  useDraftKeys(stores);

  // Empilés en Z (CDC 2026) : le vide, qui est le fond de la page, puis le canvas, puis les pills.
  return (
    <main>
      {stores && <PixelCanvas store={stores.canvas} draftStore={stores.draft} canvasId={canvasId} />}
      <Pill dock="tl">
        <h1 style={{ margin: 0, fontSize: 14 }}>{displayName}</h1>
      </Pill>
      {stores && <AccountLink store={stores.canvas} login={login} />}
      {stores && <InspectionPill store={stores.canvas} draftStore={stores.draft} />}
      {stores ? (
        <DraftPill store={stores.canvas} draftStore={stores.draft} login={login} />
      ) : (
        <Pill dock="bc">Connexion…</Pill>
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
