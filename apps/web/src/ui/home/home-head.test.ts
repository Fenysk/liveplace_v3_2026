import { readFileSync } from "node:fs";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Route as HomeRoute } from "../../routes/index";
import type { Locale } from "../locale/locale";
import { HOME_IMAGE_PATH, HOME_IMAGE_VERSION, homeHead } from "./home-head";
import { HOME_HEAD_TEXTS } from "./home-head-texts";

const PUBLIC_URL = "https://liveplace.example";
const HOME_URL = `${PUBLIC_URL}/`;
const IMAGE_URL = `${PUBLIC_URL}/og-home.png?v=1`;

const FRENCH_TITLE = "LivePlace · Une fresque de pixels pour ton stream Twitch";
const FRENCH_DESCRIPTION =
  "Une fresque de pixels collaborative pour ton stream Twitch : tes viewers dessinent depuis leur téléphone ou leur PC, et la fresque s'affiche sur ton stream avec OBS.";

type Tag = Record<string, unknown>;

const tagsOf = (locale: Locale): Tag[] => homeHead(PUBLIC_URL, locale).meta;
const cardOf = (locale: Locale): Tag[] =>
  tagsOf(locale).filter((tag) => /^(og|twitter):/.test(String(tag.property ?? tag.name ?? "")));

// Le routeur de Start rend ces balises dans le `<head>` : le même `HeadContent`, la racine pose « LivePlace » comme la vraie.
const renderHead = async (locale: Locale): Promise<string> => {
  const root = createRootRoute({
    loader: () => ({ locale }),
    head: () => ({ meta: [{ title: "LivePlace" }] }),
    component: () => createElement("html", null, createElement("head", null, createElement(HeadContent))),
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    loader: () => ({ publicUrl: PUBLIC_URL }),
    // Sans la feuille de style : Vitest la vide, et React refuse un lien `stylesheet` sans adresse.
    head: async (context) => {
      const page = await HomeRoute.options.head?.(context as never);
      return {
        meta: page?.meta ?? [],
        links: page?.links?.filter((link) => link?.rel !== "stylesheet") ?? [],
      };
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
};

const structuredOf = (html: string): { "@context": string; "@graph": Record<string, unknown>[] } => {
  const [, json = ""] = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/) ?? [];
  return JSON.parse(json);
};

describe("la head de la page d'accueil", () => {
  // Quand un robot lit `/`, le système doit lui donner un titre et une description dans la langue de la page
  it("titles and describes the page in the language of the page", () => {
    expect(tagsOf("fr")).toContainEqual({ title: FRENCH_TITLE });
    expect(tagsOf("fr")).toContainEqual({ name: "description", content: FRENCH_DESCRIPTION });
    expect(tagsOf("en")).toContainEqual({ title: "LivePlace · A pixel canvas for your Twitch stream" });
    expect(tagsOf("en")).toContainEqual({
      name: "description",
      content:
        "A collaborative pixel canvas for your Twitch stream: your viewers draw from their phone or PC, and the canvas shows on your stream with OBS.",
    });
  });

  // Quand le serveur tourne sur une adresse publique, le système doit y bâtir l'adresse canonique de `/`
  it("builds the canonical address on the public address of the server", () => {
    expect(homeHead(PUBLIC_URL, "fr").links).toEqual([{ rel: "canonical", href: HOME_URL }]);
    expect(homeHead("http://localhost:3150", "en").links).toEqual([
      { rel: "canonical", href: "http://localhost:3150/" },
    ]);
  });

  // Quand le lien de `/` est collé dans Discord, X ou Facebook, le système doit donner la carte, avec une grande image versionnée
  it("posts the share card with a big versioned image", () => {
    expect(cardOf("fr")).toEqual([
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "LivePlace" },
      { property: "og:url", content: HOME_URL },
      { property: "og:title", content: FRENCH_TITLE },
      { property: "og:description", content: FRENCH_DESCRIPTION },
      { property: "og:image", content: IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: HOME_HEAD_TEXTS.fr.imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: FRENCH_TITLE },
      { name: "twitter:description", content: FRENCH_DESCRIPTION },
      { name: "twitter:image", content: IMAGE_URL },
      { property: "og:locale", content: "fr_FR" },
    ]);
    expect(cardOf("en")).toContainEqual({ property: "og:locale", content: "en_US" });
    expect(cardOf("en")).toContainEqual({
      property: "og:title",
      content: "LivePlace · A pixel canvas for your Twitch stream",
    });
  });

  // L'image de la carte est un fichier du dépôt : un PNG de 1200×630, léger, à l'adresse que la carte annonce
  it("points the card at a light 1200×630 PNG kept in the public folder", () => {
    const file = readFileSync(new URL(`../../../public${HOME_IMAGE_PATH}`, import.meta.url));

    expect(HOME_IMAGE_PATH).toBe("/og-home.png");
    expect(HOME_IMAGE_VERSION).toBe(1);
    expect(file.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(file.length).toBeLessThanOrEqual(300 * 1024);
  });

  // Quand un moteur de recherche lit `/`, le système doit lui donner un site et une application web, en JSON qui se lit
  it("describes a website and a free web application as structured data that parses", async () => {
    const structured = structuredOf(await renderHead("fr"));

    expect(structured["@context"]).toBe("https://schema.org");
    expect(structured["@graph"]).toEqual([
      { "@type": "WebSite", name: "LivePlace", url: HOME_URL },
      {
        "@type": "WebApplication",
        name: "LivePlace",
        url: HOME_URL,
        description: FRENCH_DESCRIPTION,
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Web",
        inLanguage: "fr-FR",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
    ]);
  });

  // Quand la page est en anglais, le système doit dire l'application en anglais
  it("says the web application in English when the page is in English", async () => {
    const [, application] = structuredOf(await renderHead("en"))["@graph"] ?? [];

    expect(application).toMatchObject({ inLanguage: "en-US", description: HOME_HEAD_TEXTS.en.description });
  });

  // Quand la racine pose « LivePlace » et que `/` pose son titre, le système doit n'écrire qu'un seul titre, une description, une canonique
  it("writes a single title, description and canonical address, and no inline style", async () => {
    const html = await renderHead("fr");

    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain(`<title>${FRENCH_TITLE}</title>`);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(html).not.toMatch(/\sstyle=/);
  });

  // La route lit la langue que la racine a rendue, le français sans elle, et garde la feuille de style de la page
  it("reads the language from the root, French without it, and keeps the page stylesheet", async () => {
    const french = await HomeRoute.options.head?.({
      loaderData: { publicUrl: PUBLIC_URL },
      matches: [],
    } as never);
    const english = await HomeRoute.options.head?.({
      loaderData: { publicUrl: PUBLIC_URL },
      matches: [{ loaderData: { locale: "en" } }],
    } as never);

    expect(french?.meta).toContainEqual({ title: FRENCH_TITLE });
    expect(english?.meta).toContainEqual({ title: "LivePlace · A pixel canvas for your Twitch stream" });
    expect(french?.links).toContainEqual({ rel: "canonical", href: HOME_URL });
    expect(french?.links?.some((link) => link?.rel === "stylesheet")).toBe(true);
  });

  // Si le loader n'a rien rendu, la route ne doit poser que la feuille de style : jamais une adresse inventée
  it("posts only the stylesheet when the loader returned nothing", async () => {
    const head = await HomeRoute.options.head?.({ loaderData: undefined, matches: [] } as never);

    expect(head?.meta ?? []).toEqual([]);
    expect(head?.links).toHaveLength(1);
    expect(head?.links?.[0]).toMatchObject({ rel: "stylesheet" });
  });
});

describe("les mots de la head de la page d'accueil", () => {
  // Titre sous 60 caractères et description sous 165 : Google coupe au-delà dans ses résultats
  it("keeps the title and the description short enough for a search result", () => {
    for (const locale of ["fr", "en"] as const) {
      expect(HOME_HEAD_TEXTS[locale].title.length).toBeLessThanOrEqual(60);
      expect(HOME_HEAD_TEXTS[locale].description.length).toBeLessThanOrEqual(165);
      expect(HOME_HEAD_TEXTS[locale].description.length).toBeGreaterThanOrEqual(110);
    }
  });

  // « fresque », « dessin », « viewer » : jamais solution, plateforme, joueur, compte, utilisateur (anglais : canvas, viewer)
  it("uses the words of the product and no marketing word", () => {
    expect(HOME_HEAD_TEXTS.fr.title).toContain("fresque");
    expect(HOME_HEAD_TEXTS.fr.description).toContain("viewers");
    expect(HOME_HEAD_TEXTS.en.title).toContain("canvas");
    expect(HOME_HEAD_TEXTS.en.description).toContain("viewers");
    for (const locale of ["fr", "en"] as const)
      expect(Object.values(HOME_HEAD_TEXTS[locale]).join(" ")).not.toMatch(
        /solution|plateforme|platform|joueur|compte|utilisateur|player|account|user/i,
      );
  });
});
