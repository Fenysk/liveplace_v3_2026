// Ce que partagent `/{login}` et `/{login}/obs` (§9.1) : le même loader, le même canvas introuvable.
// Le tiret en tête du nom : le routeur ignore ce fichier, ce n'est pas une route.

import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { NoticePill } from "../ui/design/pill";
import { SignInButton } from "../ui/design/twitch";
import { resolveCanvas } from "../usecase/resolve-canvas";

// Toujours exécutée sur le serveur, où que tourne le loader : la clé de Convex n'en sort jamais.
const getCanvasPage = createServerFn({ method: "GET" })
  .validator((login: string) => login)
  .handler(({ data: login, context }) => resolveCanvas(context.deps.durable, login));

export const resolveCanvasPage = async ({ params }: { params: { login: string } }) => {
  const page = await getCanvasPage({ data: params.login });
  if (!page) throw notFound();
  return page;
};

// OBS Studio met les pages en cache (§9.1, §13).
export const noStoreHeaders = () => ({ "Cache-Control": "no-store" });

// `lp-game` : caché en vue OBS, aucun texte sur le stream (JOURNAL 2026-09-25).
export const CanvasNotFound = () => (
  <main className="lp-game">
    <NoticePill title="Ce pseudo n'a pas encore de canvas sur LivePlace.">
      <SignInButton href="/auth/twitch" label="Se connecter avec Twitch" />
    </NoticePill>
  </main>
);
