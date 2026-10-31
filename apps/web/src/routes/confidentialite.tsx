// `/confidentialite` : passe avant `/{login}`, comme `/design` (JOURNAL 2026-09-27).

import { createFileRoute } from "@tanstack/react-router";
import { localeOfMatches } from "../ui/locale/locale";
import privacyCss from "../ui/privacy/privacy.css?url";
import { PrivacyPage } from "../ui/privacy/privacy-page";
import { PRIVACY_TEXTS } from "../ui/privacy/privacy-texts";

export const Route = createFileRoute("/confidentialite")({
  head: ({ matches }) => ({
    meta: [{ title: PRIVACY_TEXTS[localeOfMatches(matches)].documentTitle }],
    links: [{ rel: "stylesheet", href: privacyCss }],
  }),
  component: PrivacyPage,
});
