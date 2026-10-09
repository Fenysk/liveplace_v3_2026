// La carte d'aperçu d'un lien collé dans Discord, X ou Facebook : les `meta` de la page d'un canvas, rendues par le serveur.
// Les textes sont posés tels quels : l'échappement est celui de React, qui rend chaque `meta` en attributs.

import type { CanvasOwner } from "../../usecase/resolve-canvas";

// Ce que la carte lit : l'adresse publique du site, le streamer, et le thème du canvas s'il en a un.
export type LinkPreviewPage = { publicUrl: string; owner: CanvasOwner; theme?: string };

export type PreviewMeta = { name: string; content: string } | { property: string; content: string };

const SITE_NAME = "LivePlace";
const previewTitle = (displayName: string): string => `Viens dessiner sur le canvas de ${displayName}`;
const DEFAULT_DESCRIPTION = "Un canvas collaboratif, en direct sur Twitch.";

export const linkPreviewMeta = ({ publicUrl, owner, theme }: LinkPreviewPage): PreviewMeta[] => {
  const title = previewTitle(owner.displayName);
  const description = theme ?? DEFAULT_DESCRIPTION;
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
