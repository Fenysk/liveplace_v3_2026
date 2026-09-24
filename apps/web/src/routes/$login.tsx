// `/{login}` : l'unique adresse d'un canvas, dans le navigateur comme dans OBS (§9.1).

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import type { CanvasStore } from "../state/canvas-store";
import { createDraftStore, type DraftClock, type DraftStore } from "../state/draft-store";
import { AccountPill } from "../ui/account/account-pill";
import { useAccountPillProps } from "../ui/account/use-account-pill";
import { CanvasPill } from "../ui/canvas/canvas-pill";
import { PixelCanvas } from "../ui/canvas/pixel-canvas";
import { Button } from "../ui/design/button";
import { NoticePill } from "../ui/design/pill";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../ui/design/use-media-query";
import { DraftPill, type DraftPillActions } from "../ui/draft/draft-pill";
import { useDraftKeys } from "../ui/draft/use-draft-keys";
import { useDraftPillProps } from "../ui/draft/use-draft-pill";
import { InspectionPill } from "../ui/inspection/inspection-pill";
import { useInspectionPillProps } from "../ui/inspection/use-inspection-pill";
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

// Avant les stores (rendu serveur, puis le temps d'ouvrir le WebSocket), la pill Dessin est déjà là, en connexion.
const doNothing = (): void => undefined;
const CONNECTING_ACTIONS: DraftPillActions = {
  onEnter: doNothing,
  onExit: doNothing,
  onSubmit: doNothing,
  onDiscard: doNothing,
  onPickColor: doNothing,
  onPickRecentColor: doNothing,
  onToggleEraser: doNothing,
  onToggleTouchTracing: doNothing,
  onReload: doNothing,
};

type LivePillsProps = { stores: Stores; login: string; isCompact: boolean };

// Les pills qui lisent les stores : chacune reçoit ses props de son hook (JOURNAL 2026-09-24).
const LivePills = ({ stores, login, isCompact }: LivePillsProps) => {
  const account = useAccountPillProps(stores.canvas, login);
  const draft = useDraftPillProps(stores, login);
  const inspection = useInspectionPillProps(stores);
  return (
    <>
      <AccountPill {...account} isCompact={isCompact} />
      <InspectionPill {...inspection} />
      <DraftPill {...draft} isCompact={isCompact} />
    </>
  );
};

const CanvasPage = () => {
  const { canvasId, owner } = Route.useLoaderData();
  const { login } = Route.useParams();
  const { openCanvas } = Route.useRouteContext();
  const [stores, setStores] = useState<Stores>();
  const isCompact = useMediaQuery(COMPACT_SCREEN_QUERY);

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
      <h1 className="lp-visually-hidden">Canvas de {owner.displayName}</h1>
      {stores && <PixelCanvas store={stores.canvas} draftStore={stores.draft} canvasId={canvasId} />}
      <CanvasPill owner={owner} isCompact={isCompact} />
      {stores ? (
        <LivePills stores={stores} login={login} isCompact={isCompact} />
      ) : (
        <DraftPill state={{ kind: "connecting" }} actions={CONNECTING_ACTIONS} />
      )}
    </main>
  );
};

const CanvasNotFound = () => (
  <main>
    <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
      <Button label="Se connecter avec Twitch" icon={LogIn} variant="primary" href="/auth/twitch" />
    </NoticePill>
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
