// `/confidentialite` : passe avant `/{login}`, comme `/design` (JOURNAL 2026-09-27). La page et son en-tête sont ceux de l'accueil
// (home.css), les deux colonnes sont celles des documents (document.css).

import { createFileRoute } from "@tanstack/react-router";
import documentCss from "../ui/document/document.css?url";
import homeCss from "../ui/home/home.css?url";
import { localeOfMatches } from "../ui/locale/locale";
import { PrivacyPage } from "../ui/privacy/privacy-page";
import { PRIVACY_TEXTS } from "../ui/privacy/privacy-texts";

export const Route = createFileRoute("/confidentialite")({
  head: ({ matches }) => ({
    meta: [{ title: PRIVACY_TEXTS[localeOfMatches(matches)].documentTitle }],
    links: [
      { rel: "stylesheet", href: homeCss },
      { rel: "stylesheet", href: documentCss },
    ],
  }),
  component: PrivacyPage,
});
