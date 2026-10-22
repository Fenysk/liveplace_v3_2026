// `/` : la page d'accueil, une démo jouable qui reste dans le navigateur (Écart §9.1, JOURNAL 2026-10-22).

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import homeCss from "../ui/home/home.css?url";
import { homeHead } from "../ui/home/home-head";
import { HomePage } from "../ui/home/home-page";
import { localeOfMatches } from "../ui/locale/locale";

// L'adresse publique, que seul le serveur connaît : la canonique et la carte de partage de `/` s'y bâtissent.
const getHomePage = createServerFn({ method: "GET" }).handler(({ context }) => ({
  publicUrl: context.deps.publicUrl,
}));

export const Route = createFileRoute("/")({
  loader: () => getHomePage(),
  staleTime: Number.POSITIVE_INFINITY, // l'adresse ne change qu'au déploiement
  head: ({ loaderData, matches }) => {
    // Sans loader (le temps d'un chargement), la page garde sa feuille de style : jamais une adresse inventée.
    const search = loaderData ? homeHead(loaderData.publicUrl, localeOfMatches(matches)) : undefined;
    return {
      meta: search?.meta ?? [],
      links: [{ rel: "stylesheet", href: homeCss }, ...(search?.links ?? [])],
    };
  },
  component: HomePage,
});
