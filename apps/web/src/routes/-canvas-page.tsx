// Ce que partagent `/{login}` et `/{login}/obs` (§9.1) : le même loader, le même canvas introuvable.
// Le tiret en tête du nom : le routeur ignore ce fichier, ce n'est pas une route.

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { NoticePill } from "../ui/design/pill";
import { SignInButton, SignInNote } from "../ui/design/twitch";
import { markRecoveringIfLost } from "../usecase/mark-recovering";
import { type ResolvedCanvas, resolveCanvas } from "../usecase/resolve-canvas";

// Toujours exécutée sur le serveur, où que tourne le loader : la clé de Convex n'en sort jamais.
const getCanvasPage = createServerFn({ method: "GET" })
  .validator((login: string) => login)
  .handler(async ({ data: login, context }) => {
    const page = await resolveCanvas(context.deps.durable, login);
    // Écart §4.2 (JOURNAL 2026-10-08) : un canvas que Redis a perdu se dit « en récupération » dès ce rendu.
    if (page)
      await markRecoveringIfLost(
        { marks: context.deps.recoveryMarks, recovery: context.deps.recovery },
        page.canvasId,
      );
    return page;
  });

// La page du jeu lit en plus le cookie de session (JOURNAL 2026-10-06) ; la vue OBS n'en a pas besoin.
const getGameCanvasPage = createServerFn({ method: "GET" })
  .validator((login: string) => login)
  .handler(async ({ data: login, context }) => {
    const page = await resolveCanvas(
      context.deps.durable,
      login,
      { verifier: context.deps.verifier, cookieHeader: getRequestHeader("cookie") },
      context.deps.tracker, // Écart §4 (JOURNAL 2026-10-07) : le live du streamer, lu à Redis, jamais à Twitch
    );
    if (page)
      await markRecoveringIfLost(
        { marks: context.deps.recoveryMarks, recovery: context.deps.recovery },
        page.canvasId,
      );
    return page;
  });

const toPage = (page: ResolvedCanvas | null): ResolvedCanvas => {
  if (!page) throw notFound();
  return page;
};

type CanvasPageLoaderArgs = { params: { login: string } };

export const resolveCanvasPage = async ({ params }: CanvasPageLoaderArgs) =>
  toPage(await getCanvasPage({ data: params.login }));

export const resolveGameCanvasPage = async ({ params }: CanvasPageLoaderArgs) =>
  toPage(await getGameCanvasPage({ data: params.login }));

// OBS Studio met les pages en cache (§9.1, §13).
export const noStoreHeaders = () => ({ "Cache-Control": "no-store" });

// `lp-game` : caché en vue OBS, aucun texte sur le stream (JOURNAL 2026-09-25).
export const CanvasNotFound = () => (
  <main className="lp-game">
    <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
      <SignInButton href="/auth/twitch" label="Se connecter avec Twitch" />
      <SignInNote />
    </NoticePill>
  </main>
);
