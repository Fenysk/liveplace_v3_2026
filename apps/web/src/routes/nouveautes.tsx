// `/nouveautes` : passe avant `/{login}`, comme `/confidentialite`. Les mêmes marges et la même colonne de réglages que l'accueil ;
// la page est une colonne de 1200 px au plus : une phrase d'accueil, puis des cartes (une image, un titre, une phrase), en grille par
// groupe au PC, l'une sous l'autre sur un écran étroit (release-notes.css).

import { createFileRoute } from "@tanstack/react-router";
import homeCss from "../ui/home/home.css?url";
import { localeOfMatches } from "../ui/locale/locale";
import { ReleaseNotesPage } from "../ui/release-notes/release-notes-page";
import { RELEASE_NOTES_TEXTS } from "../ui/release-notes/release-notes-texts";

export const Route = createFileRoute("/nouveautes")({
  head: ({ matches }) => ({
    meta: [{ title: RELEASE_NOTES_TEXTS[localeOfMatches(matches)].documentTitle }],
    links: [{ rel: "stylesheet", href: homeCss }],
  }),
  component: ReleaseNotesPage,
});
