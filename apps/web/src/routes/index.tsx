// `/` : la page d'accueil, une démo jouable qui reste dans le navigateur (Écart §9.1, JOURNAL 2026-10-22).

import { createFileRoute } from "@tanstack/react-router";
import homeCss from "../ui/home/home.css?url";
import { HomePage } from "../ui/home/home-page";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "stylesheet", href: homeCss }] }),
  component: HomePage,
});
