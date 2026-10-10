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
import { Route as CanvasRoute } from "../../routes/$login";
import { Route as ArchiveRoute } from "../../routes/$login_.archives.$code";
import { Route as ObsRoute } from "../../routes/$login_.obs";
import {
  type LinkPreviewPage,
  linkPreviewMeta,
  PREVIEW_LAYOUT_VERSION,
  PREVIEW_SLICE_SECONDS,
  previewImageVersion,
} from "./link-preview";

const PAGE: LinkPreviewPage = {
  publicUrl: "https://liveplace.example",
  owner: { displayName: "Fenysk", login: "fenysk", avatarUrl: "https://cdn.example/fenysk.png" },
  theme: "Un chat dans l'espace",
  imageVersion: "2-5900000",
};

// Le routeur de Start rend ces `meta` dans le `<head>` : le même `HeadContent`, sur une route qui pose la carte.
const renderHead = async (page: LinkPreviewPage): Promise<string> => {
  const root = createRootRoute({
    component: () => createElement("html", null, createElement("head", null, createElement(HeadContent))),
  });
  const canvas = createRoute({
    getParentRoute: () => root,
    path: "/$login",
    head: () => ({ meta: linkPreviewMeta(page, "fr") }),
  });
  const router = createRouter({
    routeTree: root.addChildren([canvas]),
    history: createMemoryHistory({ initialEntries: ["/fenysk"] }),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
};

describe("la carte d'aperçu du lien d'un canvas", () => {
  // Quand le lien d'un canvas est collé, le système doit y mettre le pseudo, le thème, l'image du canvas et l'adresse de la page
  it("titles the card with the owner, describes it with the theme and shows the canvas image", () => {
    expect(linkPreviewMeta(PAGE, "fr")).toEqual([
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "LivePlace" },
      { property: "og:url", content: "https://liveplace.example/fenysk" },
      { property: "og:title", content: "Viens dessiner sur la fresque de Fenysk" },
      { property: "og:description", content: "Un chat dans l'espace" },
      { property: "og:image", content: "https://liveplace.example/fenysk/preview.png?v=2-5900000" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Viens dessiner sur la fresque de Fenysk" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Viens dessiner sur la fresque de Fenysk" },
      { name: "twitter:description", content: "Un chat dans l'espace" },
      { name: "twitter:image", content: "https://liveplace.example/fenysk/preview.png?v=2-5900000" },
    ]);
  });

  // Si le canvas n'a pas de thème, alors le système doit décrire la carte par la phrase de LivePlace
  it("describes the card with the LivePlace sentence when the canvas has no theme", () => {
    const { theme: _theme, ...withoutTheme } = PAGE;

    const meta = linkPreviewMeta(withoutTheme, "fr");

    expect(meta).toContainEqual({
      property: "og:description",
      content: "Une fresque collaborative, en direct sur Twitch.",
    });
    expect(meta).toContainEqual({
      name: "twitter:description",
      content: "Une fresque collaborative, en direct sur Twitch.",
    });
  });

  // Si Twitch a donné une photo ou non, alors le système doit montrer la même image du canvas, sans jamais la photo
  it("shows the same canvas image whether or not the owner has a photo, and never the photo", () => {
    const { avatarUrl: _avatarUrl, ...withoutPhoto } = PAGE.owner;

    const meta = linkPreviewMeta({ ...PAGE, owner: withoutPhoto }, "fr");

    expect(meta).toEqual(linkPreviewMeta(PAGE, "fr"));
    expect(JSON.stringify(linkPreviewMeta(PAGE, "fr"))).not.toContain("cdn.example");
  });

  // Quand le site tourne sur une adresse publique, le système doit y bâtir celle de la page : adresse du site puis login
  it("builds og:url and the image on the public address and the login of the owner", () => {
    const meta = linkPreviewMeta(
      { ...PAGE, publicUrl: "http://localhost:3000", owner: { ...PAGE.owner, login: "mr_pixel" } },
      "fr",
    );

    expect(meta).toContainEqual({ property: "og:url", content: "http://localhost:3000/mr_pixel" });
    expect(meta).toContainEqual({
      property: "og:image",
      content: "http://localhost:3000/mr_pixel/preview.png?v=2-5900000",
    });
    expect(meta).toContainEqual({
      name: "twitter:image",
      content: "http://localhost:3000/mr_pixel/preview.png?v=2-5900000",
    });
  });

  // Si le thème ou le pseudo portent des guillemets, des chevrons ou une esperluette, alors le head ne doit rien laisser s'échapper
  it("keeps a theme and a name full of quotes and brackets inside their attributes in the head", async () => {
    const theme = `"><script>alert(1)</script> & <b>"gras"</b>`;
    const displayName = `<img src=x onerror=alert(2)> & "Bob"`;

    const html = await renderHead({ ...PAGE, theme, owner: { ...PAGE.owner, displayName } });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain(
      `content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;&quot;gras&quot;&lt;/b&gt;"`,
    );
    expect(html).toContain(
      `content="Viens dessiner sur la fresque de &lt;img src=x onerror=alert(2)&gt; &amp; &quot;Bob&quot;"`,
    );
  });

  // Quand la route d'un canvas rend son head, le système doit y poser la carte de ce que le loader a rendu
  it("posts the card on the canvas route from what its loader returned", async () => {
    const head = await CanvasRoute.options.head?.({ loaderData: PAGE, matches: [] } as never);

    expect(head?.meta).toEqual(expect.arrayContaining(linkPreviewMeta(PAGE, "fr")));
  });

  // Si le pseudo n'a pas de canvas, alors la route ne doit poser aucune carte
  it("posts no card when the login has no canvas", async () => {
    const head = await CanvasRoute.options.head?.({ loaderData: undefined, matches: [] } as never);

    expect(head).toEqual({});
  });

  // Quand le visiteur est en anglais, alors la carte se dit en anglais, au titre comme à la description par défaut
  it("says the card in English when the page is in English", () => {
    const { theme: _theme, ...withoutTheme } = PAGE;

    const meta = linkPreviewMeta(withoutTheme, "en");

    expect(meta).toContainEqual({ property: "og:title", content: "Come draw on Fenysk's canvas" });
    expect(meta).toContainEqual({
      property: "og:description",
      content: "A collaborative canvas, live on Twitch.",
    });
    expect(meta).toContainEqual({ name: "twitter:title", content: "Come draw on Fenysk's canvas" });
  });

  // Le thème est le texte du streamer : il ne se traduit pas
  it("keeps the theme as the owner wrote it, whatever the language", () => {
    expect(linkPreviewMeta(PAGE, "en")).toContainEqual({
      property: "og:description",
      content: "Un chat dans l'espace",
    });
  });

  // Le robot de l'aperçu n'envoie ni cookie ni langue : la route lit le français par défaut, l'anglais si la racine l'a rendu
  it("posts the card in the language the root rendered, French without it", async () => {
    const french = await CanvasRoute.options.head?.({ loaderData: PAGE, matches: [] } as never);
    const english = await CanvasRoute.options.head?.({
      loaderData: PAGE,
      matches: [{ loaderData: { locale: "en" } }],
    } as never);

    expect(french?.meta).toContainEqual({
      property: "og:title",
      content: "Viens dessiner sur la fresque de Fenysk",
    });
    expect(english?.meta).toContainEqual({ property: "og:title", content: "Come draw on Fenysk's canvas" });
  });

  // Quand une archive ou la vue OBS rend son head, le système ne doit y mettre aucune carte
  it("leaves the archive page and the OBS view without a card", async () => {
    const archive = await ArchiveRoute.options.head?.({} as never);

    expect(archive?.meta).toEqual([{ name: "robots", content: "noindex" }]);
    expect(ObsRoute.options.head).toBeUndefined();
  });
});

describe("la version de l'adresse de l'image d'aperçu", () => {
  // Quand la page est rendue, le système doit donner à l'image une adresse qui change avec la mise en page et chaque tranche de 5 minutes
  it("changes the address of the image with the layout and with every slice of five minutes", () => {
    const slice = 5_900_000;
    const start = slice * PREVIEW_SLICE_SECONDS * 1000;

    expect(previewImageVersion(start)).toBe(`${PREVIEW_LAYOUT_VERSION}-5900000`);
    expect(previewImageVersion(start + PREVIEW_SLICE_SECONDS * 1000 - 1)).toBe(
      `${PREVIEW_LAYOUT_VERSION}-5900000`,
    );
    expect(previewImageVersion(start + PREVIEW_SLICE_SECONDS * 1000)).toBe(
      `${PREVIEW_LAYOUT_VERSION}-5900001`,
    );
    expect(previewImageVersion(start - 1)).toBe(`${PREVIEW_LAYOUT_VERSION}-5899999`);
  });

  // La tranche est celle du `max-age` de l'image : cinq minutes, et la mise en page en est à sa deuxième version
  it("slices like the max-age of the image, five minutes, and the layout is at its second version", () => {
    expect(PREVIEW_SLICE_SECONDS).toBe(300);
    expect(PREVIEW_LAYOUT_VERSION).toBe(2);
  });

  // Quand la version est donnée à la carte, le système doit la poser sur l'image de Discord et de X, et nulle part ailleurs
  it("puts the version on the image of Discord and X, and nowhere else", () => {
    const meta = linkPreviewMeta({ ...PAGE, imageVersion: "2-7" }, "fr");
    const withVersion = meta.filter(({ content }) => content.includes("?v="));

    expect(withVersion).toEqual([
      { property: "og:image", content: "https://liveplace.example/fenysk/preview.png?v=2-7" },
      { name: "twitter:image", content: "https://liveplace.example/fenysk/preview.png?v=2-7" },
    ]);
  });
});
