// La carte d'aperçu d'un lien collé dans Discord, X ou Facebook : les `meta` de la page d'un canvas, rendues par le serveur.
// Les textes sont posés tels quels : l'échappement est celui de React, qui rend chaque `meta` en attributs.

import type { CanvasOwner } from "../../usecase/resolve-canvas";
import type { Locale } from "../locale/locale";
import { LINK_PREVIEW_TEXTS } from "./link-preview-texts";

// Ce que la carte lit : l'adresse publique du site, le streamer, et le thème du canvas s'il en a un.
export type LinkPreviewPage = { publicUrl: string; owner: CanvasOwner; theme?: string };

export type PreviewMeta = { name: string; content: string } | { property: string; content: string };

const SITE_NAME = "LivePlace";

export const linkPreviewMeta = (
  { publicUrl, owner, theme }: LinkPreviewPage,
  locale: Locale,
): PreviewMeta[] => {
  const texts = LINK_PREVIEW_TEXTS[locale];
  const title = texts.title(owner.displayName);
  const description = theme ?? texts.description;
  const image = owner.avatarUrl;
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:url", content: `${publicUrl}/${encodeURIComponent(owner.login)}` },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(image ? [{ name: "twitter:image", content: image }] : []),
  ];
};
