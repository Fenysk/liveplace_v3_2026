// Ce que `/` écrit dans sa `head` pour les moteurs de recherche et les cartes de partage (Écart §9.1, JOURNAL 2026-10-22) :
// titre, description, adresse canonique, carte Open Graph et Twitter, et le JSON-LD d'un site et de son application web.
// Rien qui vienne d'un visiteur : seulement les phrases de `home-head-texts.ts` et l'adresse publique du serveur.

import { pageCardMeta, SITE_NAME } from "../link-preview/link-preview";
import { INTL_TAGS, type Locale } from "../locale/locale";
import { HOME_HEAD_TEXTS } from "./home-head-texts";

// Écart §14 (JOURNAL 2026-10-28) : l'image de partage de chaque langue ; la française garde son adresse, que Discord et X ont en cache.
export const HOME_IMAGE_PATHS: Record<Locale, string> = { fr: "/og-home.png", en: "/og-home-en.png" };
// À incrémenter quand l'image change : Discord et X gardent une image par son adresse.
export const HOME_IMAGE_VERSION = 1;

// Le JSON-LD de schema.org : le site, et l'application web gratuite qu'il présente.
const structuredGraph = (url: string, description: string, locale: Locale) => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: SITE_NAME, url },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url,
      description,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Web",
      inLanguage: INTL_TAGS[locale],
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    },
  ],
});

export const homeHead = (publicUrl: string, locale: Locale) => {
  const texts = HOME_HEAD_TEXTS[locale];
  const url = `${publicUrl}/`;
  return {
    meta: [
      { title: texts.title },
      { name: "description", content: texts.description },
      ...pageCardMeta({
        url,
        title: texts.title,
        description: texts.description,
        image: `${publicUrl}${HOME_IMAGE_PATHS[locale]}?v=${HOME_IMAGE_VERSION}`,
        imageAlt: texts.imageAlt,
      }),
      // `fr-FR` pour `Intl`, `fr_FR` pour Open Graph
      { property: "og:locale", content: INTL_TAGS[locale].replace("-", "_") },
      { "script:ld+json": structuredGraph(url, texts.description, locale) },
    ],
    links: [{ rel: "canonical", href: url }],
  };
};
