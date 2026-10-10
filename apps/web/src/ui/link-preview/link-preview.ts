// La carte d'aperçu d'un lien collé dans Discord, X ou Facebook : les `meta` de la page d'un canvas, rendues par le serveur.
// Les textes sont posés tels quels : l'échappement est celui de React, qui rend chaque `meta` en attributs.
// L'image est celle du canvas lui-même, rendue par le serveur du web (`preview-image.ts`).

import type { CanvasOwner } from "../../usecase/resolve-canvas";
import type { Locale } from "../locale/locale";
import { LINK_PREVIEW_TEXTS } from "./link-preview-texts";

// Ce que la carte lit : l'adresse publique du site, le streamer, et le thème du canvas s'il en a un.
// `imageVersion` : celle de l'adresse de l'image (`previewImageVersion`), calculée par le serveur au rendu de la page.
export type LinkPreviewPage = { publicUrl: string; owner: CanvasOwner; theme?: string; imageVersion: string };

export type PreviewMeta = { name: string; content: string } | { property: string; content: string };

// La taille recommandée des grandes cartes : l'image du canvas est rendue à celle-ci.
export const PREVIEW_IMAGE_WIDTH = 1200;
export const PREVIEW_IMAGE_HEIGHT = 630;

// Discord garde l'image d'une carte par son adresse : elle change avec la mise en page (à incrémenter quand le dessin change)
// et à chaque tranche de la durée que l'image se garde (`max-age` de `/{login}/preview.png`, preview-response.ts).
export const PREVIEW_LAYOUT_VERSION = 2;
export const PREVIEW_SLICE_SECONDS = 300;

export const previewImageVersion = (nowMs: number): string =>
  `${PREVIEW_LAYOUT_VERSION}-${Math.floor(nowMs / (PREVIEW_SLICE_SECONDS * 1000))}`;

const SITE_NAME = "LivePlace";

export const linkPreviewMeta = (
  { publicUrl, owner, theme, imageVersion }: LinkPreviewPage,
  locale: Locale,
): PreviewMeta[] => {
  const texts = LINK_PREVIEW_TEXTS[locale];
  const title = texts.title(owner.displayName);
  const description = theme ?? texts.description;
  const image = `${publicUrl}/${encodeURIComponent(owner.login)}/preview.png?v=${imageVersion}`;
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:url", content: `${publicUrl}/${encodeURIComponent(owner.login)}` },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: String(PREVIEW_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(PREVIEW_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
};
