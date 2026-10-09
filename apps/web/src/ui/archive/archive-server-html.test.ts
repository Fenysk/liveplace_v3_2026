import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedArchive } from "../../usecase/resolve-archive";
import { SWATCH_TONES } from "../design/swatch-tones";
import { ArchiveBanner } from "./archive-banner";
import { ArchiveNotFound } from "./archive-not-found";
import { ArchivePage } from "./archive-page";
import { DownloadWindow } from "./download-window";
import type { PngBackground } from "./png-export";

// La page d'archive n'a pas de routeur ici : `useNavigate` ne sert qu'une fois la page rendue dans le navigateur.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => () => Promise.resolve(),
}));

const doNothing = (): void => undefined;

// Un attribut `style` : la CSP de production (`default-src 'self'`, sans `style-src`) bloque celui du HTML que le
// serveur écrit, et la couleur ou la forme qu'il portait disparaît. React, lui, pose `style` par le CSSOM, que la CSP laisse.
const INLINE_STYLE = /\sstyle=/;

const archive: ResolvedArchive = {
  canvasId: "canvas-archive",
  owner: { displayName: "Kalyss", login: "kalyss", avatarUrl: "https://static-cdn.jtvnw.net/kalyss.png" },
  createdAt: Date.UTC(2026, 9, 12, 10),
  archivedAt: Date.UTC(2026, 9, 18, 10),
};

const serverHtml = {
  page: (resolved: ResolvedArchive = archive) =>
    renderToString(
      createElement(ArchivePage, {
        archive: resolved,
        openCanvas: () => {
          throw new Error("le serveur n'ouvre aucun canvas");
        },
      }),
    ),
  window: (isOpen: boolean, background: PngBackground | null = null) =>
    renderToString(
      createElement(DownloadWindow, {
        isOpen,
        background,
        onBackground: doNothing,
        isCompact: false,
        onConfirm: doNothing,
        onClose: doNothing,
      }),
    ),
  banner: (isCompact: boolean, theme?: string) =>
    renderToString(
      createElement(ArchiveBanner, {
        owner: archive.owner,
        title: theme ?? "Archive de Kalyss",
        caption: "Du 12 au 18 octobre 2026",
        isDownloading: false,
        onCopyLink: doNothing,
        onDownload: doNothing,
        isCompact,
      }),
    ),
  notFound: (displayName?: string) =>
    renderToString(createElement(ArchiveNotFound, { login: "kalyss", displayName })),
};

describe("the HTML the server writes for the archive page (CSP of production)", () => {
  // Aucun attribut `style` dans la page entière, fenêtre du PNG comprise, avec ou sans thème
  it("carries no inline style in the whole page, the PNG window included", () => {
    const html = serverHtml.page();

    expect(html).toContain("lp-swatch"); // la fenêtre du fond y est bien rendue : le garde-fou ne regarde pas dans le vide
    expect(html).not.toMatch(INLINE_STYLE);
    expect(serverHtml.page({ ...archive, theme: "Soirée de lancement" })).not.toMatch(INLINE_STYLE);
  });

  // Ni la fenêtre du fond, ouverte ou fermée, ni le bandeau sur PC et sur mobile, ni l'archive introuvable
  it("carries none in the PNG window, the banner on desktop and on mobile, nor the missing archive", () => {
    expect(serverHtml.window(false)).not.toMatch(INLINE_STYLE);
    expect(serverHtml.window(true)).not.toMatch(INLINE_STYLE);
    expect(serverHtml.banner(false)).not.toMatch(INLINE_STYLE);
    expect(serverHtml.banner(true, "Soirée de lancement")).not.toMatch(INLINE_STYLE);
    expect(serverHtml.notFound()).not.toMatch(INLINE_STYLE);
    expect(serverHtml.notFound("Kalyss")).not.toMatch(INLINE_STYLE);
  });

  // Écart §4 (JOURNAL 2026-10-07) : le bandeau d'une archive dont le streamer est en live porte son bouton teinté, sur PC et
  // sur mobile, et le HTML du serveur n'y met toujours aucun `style`
  it("carries the live button of a streamer who is live, on desktop and on mobile, with no inline style", () => {
    const live = { ...archive, owner: { ...archive.owner, twitchLive: { category: "Art" } } };

    for (const html of [serverHtml.page(live), serverHtml.banner(false), serverHtml.banner(true)]) {
      expect(html).not.toMatch(INLINE_STYLE);
    }
    expect(serverHtml.page(live)).toContain('title="Kalyss est en live sur Twitch : Art"');
    expect(serverHtml.page(live)).toContain("lp-btn--live");
    expect(serverHtml.page()).not.toContain("lp-btn--live");
  });

  // Les pastilles de fond prennent leur couleur d'une classe : Noir et Blanc ont chacune la leur, Transparent le damier
  it("gives each background swatch its look by a class: a tone for black and white, the checker for transparent", () => {
    const swatches = [...serverHtml.window(true).matchAll(/<button[^>]*class="(lp-swatch[^"]*)"/g)].map(
      ([, name]) => name,
    );

    expect(swatches).toEqual([
      "lp-swatch is-transparent",
      "lp-swatch lp-swatch--png-black",
      "lp-swatch lp-swatch--png-white",
    ]);
  });

  // JOURNAL 2026-10-10 : aucun fond n'est choisi d'avance, donc rien à droite du titre ; le choisi s'y nomme, sans nom sous les pastilles
  it("names no background next to the title of the PNG window until one is picked, and puts no name under the swatches", () => {
    const legendOf = (html: string): string => html.match(/<legend[^>]*>(.*?)<\/legend>/)?.[1] ?? "";

    expect(legendOf(serverHtml.window(true))).toBe("Fond de l&#x27;image");
    expect(legendOf(serverHtml.window(true, "white"))).toBe(
      'Fond de l&#x27;image<span class="lp-type-numeric" aria-hidden="true">Blanc</span>',
    );
    expect(serverHtml.window(true, "white")).not.toContain("lp-swatch-option");
    expect(serverHtml.window(true, "white")).not.toMatch(INLINE_STYLE);
  });
});

describe("the tones of a swatch (CSP of production)", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "design", "palette.css"), "utf8");

  // Chaque teinte est une classe de palette.css : sans elle, la pastille serait sans couleur
  it("has a class in palette.css for every tone", () => {
    expect(SWATCH_TONES.length).toBeGreaterThan(0);
    for (const tone of SWATCH_TONES)
      expect(css).toMatch(new RegExp(`\\.lp-swatch--${tone}\\s*\\{[^}]*background:`));
  });
});
