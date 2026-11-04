// `/mentions-legales` : passe avant `/{login}`, comme `/confidentialite`. La page et son en-tête sont ceux de l'accueil (home.css), les deux
// colonnes sont celles des documents (document.css).

import { createFileRoute } from "@tanstack/react-router";
import documentCss from "../ui/document/document.css?url";
import homeCss from "../ui/home/home.css?url";
import { LegalPage } from "../ui/legal/legal-page";
import { LEGAL_TEXTS } from "../ui/legal/legal-texts";
import { localeOfMatches } from "../ui/locale/locale";

export const Route = createFileRoute("/mentions-legales")({
  head: ({ matches }) => ({
    meta: [{ title: LEGAL_TEXTS[localeOfMatches(matches)].documentTitle }],
    links: [
      { rel: "stylesheet", href: homeCss },
      { rel: "stylesheet", href: documentCss },
    ],
  }),
  component: LegalPage,
});
