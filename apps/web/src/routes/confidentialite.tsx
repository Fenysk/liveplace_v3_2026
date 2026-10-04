// `/confidentialite` : passe avant `/{login}`, comme `/design` (JOURNAL 2026-09-27).

import { createFileRoute } from "@tanstack/react-router";
import privacyCss from "../ui/privacy/privacy.css?url";
import { PrivacyPage } from "../ui/privacy/privacy-page";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [{ title: "Confidentialité · LivePlace" }],
    links: [{ rel: "stylesheet", href: privacyCss }],
  }),
  component: PrivacyPage,
});
