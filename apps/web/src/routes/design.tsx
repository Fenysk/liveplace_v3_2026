// `/design` : le design system, en développement seulement (JOURNAL 2026-09-24). En production, la route répond 404.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { DesignPage } from "../ui/design-page/design-page";
import designPageCss from "../ui/design-page/design-page.css?url";

export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Design system · LivePlace" }, { name: "robots", content: "noindex" }],
    links: [{ rel: "stylesheet", href: designPageCss }],
  }),
  component: DesignPage,
});
