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
import { type LinkPreviewPage, linkPreviewMeta } from "./link-preview";

const PAGE: LinkPreviewPage = {
  publicUrl: "https://liveplace.example",
  owner: { displayName: "Fenysk", login: "fenysk", avatarUrl: "https://cdn.example/fenysk.png" },
  theme: "Un chat dans l'espace",
};

// Le routeur de Start rend ces `meta` dans le `<head>` : le même `HeadContent`, sur une route qui pose la carte.
const renderHead = async (page: LinkPreviewPage): Promise<string> => {
  const root = createRootRoute({
    component: () => createElement("html", null, createElement("head", null, createElement(HeadContent))),
  });
  const canvas = createRoute({
    getParentRoute: () => root,
    path: "/$login",
    head: () => ({ meta: linkPreviewMeta(page) }),
  });
  const router = createRouter({
    routeTree: root.addChildren([canvas]),
    history: createMemoryHistory({ initialEntries: ["/fenysk"] }),
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
};

describe("la carte d'aperçu du lien d'un canvas", () => {
  // Quand le lien d'un canvas est collé, le système doit y mettre le pseudo, le thème, la photo et l'adresse de la page
  it("titles the card with the owner, describes it with the theme and shows the Twitch photo", () => {
    expect(linkPreviewMeta(PAGE)).toEqual([
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "LivePlace" },
      { property: "og:url", content: "https://liveplace.example/fenysk" },
      { property: "og:title", content: "Viens dessiner sur le canvas de Fenysk" },
      { property: "og:description", content: "Un chat dans l'espace" },
      { property: "og:image", content: "https://cdn.example/fenysk.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Viens dessiner sur le canvas de Fenysk" },
      { name: "twitter:description", content: "Un chat dans l'espace" },
      { name: "twitter:image", content: "https://cdn.example/fenysk.png" },
    ]);
  });

  // Si le canvas n'a pas de thème, alors le système doit décrire la carte par la phrase de LivePlace
  it("describes the card with the LivePlace sentence when the canvas has no theme", () => {
    const { theme: _theme, ...withoutTheme } = PAGE;

    const meta = linkPreviewMeta(withoutTheme);

    expect(meta).toContainEqual({
      property: "og:description",
      content: "Un canvas collaboratif, en direct sur Twitch.",
    });
    expect(meta).toContainEqual({
      name: "twitter:description",
      content: "Un canvas collaboratif, en direct sur Twitch.",
    });
  });

  // Si Twitch n'a pas donné de photo, alors le système ne doit poser aucune balise image
  it("puts no image tag when the owner has no photo", () => {
    const { avatarUrl: _avatarUrl, ...withoutPhoto } = PAGE.owner;

    const meta = linkPreviewMeta({ ...PAGE, owner: withoutPhoto });

    expect(meta.some((tag) => ("property" in tag ? tag.property : tag.name).endsWith(":image"))).toBe(false);
    expect(meta).toHaveLength(8);
  });

  // Quand le site tourne sur une adresse publique, le système doit y bâtir celle de la page : adresse du site puis login
  it("builds og:url on the public address and the login of the owner", () => {
    const meta = linkPreviewMeta({
      ...PAGE,
      publicUrl: "http://localhost:3000",
      owner: { ...PAGE.owner, login: "mr_pixel" },
    });

    expect(meta).toContainEqual({ property: "og:url", content: "http://localhost:3000/mr_pixel" });
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
      `content="Viens dessiner sur le canvas de &lt;img src=x onerror=alert(2)&gt; &amp; &quot;Bob&quot;"`,
    );
  });

  // Quand la route d'un canvas rend son head, le système doit y poser la carte de ce que le loader a rendu
  it("posts the card on the canvas route from what its loader returned", async () => {
    const head = await CanvasRoute.options.head?.({ loaderData: PAGE } as never);

    expect(head?.meta).toEqual(linkPreviewMeta(PAGE));
  });

  // Si le pseudo n'a pas de canvas, alors la route ne doit poser aucune carte
  it("posts no card when the login has no canvas", async () => {
    const head = await CanvasRoute.options.head?.({ loaderData: undefined } as never);

    expect(head?.meta).toEqual([]);
  });

  // Quand une archive ou la vue OBS rend son head, le système ne doit y mettre aucune carte
  it("leaves the archive page and the OBS view without a card", async () => {
    const archive = await ArchiveRoute.options.head?.({} as never);

    expect(archive?.meta).toEqual([{ name: "robots", content: "noindex" }]);
    expect(ObsRoute.options.head).toBeUndefined();
  });
});
