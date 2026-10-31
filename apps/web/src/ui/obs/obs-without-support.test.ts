import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ObsPage } from "./obs-page";

// CDC 2026, Soutenir LivePlace : jamais dans la vue OBS, qui n'a que les pixels sur le stream. La vue OBS n'a ni routeur ni
// store ici : `useRouter` ne sert qu'une fois la page dans le navigateur.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ invalidate: () => Promise.resolve() }),
}));

const WEB_SOURCE = join(import.meta.dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(WEB_SOURCE, ...parts), "utf8");
const SUPPORT = /ko-fi|SupportButton|SupportPill|design\/support/;

describe("la vue OBS n'a pas de Soutenir LivePlace (CDC 2026, Soutenir LivePlace)", () => {
  // La page d'une source OBS n'écrit que sa surface : ni pill, ni lien, ni bouton
  it("writes only its surface: no pill, no link, no Ko-fi", () => {
    const html = renderToStaticMarkup(
      createElement(ObsPage, {
        canvasId: "canvas-1",
        login: "kalyss",
        openCanvas: () => {
          throw new Error("le serveur n'ouvre aucun canvas");
        },
      }),
    );

    expect(html).toContain('class="lp-obs"');
    expect(html).not.toMatch(SUPPORT);
    expect(html).not.toMatch(/data-dock|lp-pill|<a /);
  });

  // Aucune source de la vue OBS ne connaît la pill ni l'adresse
  it("holds no source that knows the Support pill or the Ko-fi address", () => {
    const files = readdirSync(join(WEB_SOURCE, "ui", "obs")).filter(
      (name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"),
    );
    const knowing = files.filter((name) => SUPPORT.test(read("ui", "obs", name)));

    expect(files.length).toBeGreaterThan(5);
    expect(knowing).toEqual([]);
  });

  // `/{login}/obs` ne rend que la page OBS
  it("is the only thing the forced OBS route renders", () => {
    const route = read("routes", "$login_.obs.tsx");

    expect(route).toContain("<ObsPage");
    expect(route).not.toMatch(SUPPORT);
  });

  // Sur `/{login}`, la vue OBS prend la place du jeu : la pill est dans la page du jeu, que le CSS cache dès la première image
  it("swaps the game page for the OBS page, and hides the game, where the pill lives, from the first frame", () => {
    const page = read("routes", "$login.tsx");
    const game = page.slice(
      page.indexOf("const GamePage = () => {"),
      page.indexOf("const CanvasPage = () => {"),
    );
    const canvasPage = page.slice(page.indexOf("const CanvasPage = () => {"));

    expect(game).toContain("<SupportPill />");
    expect(game).toMatch(/<main className="lp-game">[\s\S]*<SupportPill \/>[\s\S]*<\/main>/);
    expect(canvasPage).toMatch(/useIsObsView\(\) \? \(\s*<ObsPage[^>]*\/>\s*\) : \(\s*<GamePage \/>/);
    expect(canvasPage).not.toContain("SupportPill");
    expect(read("ui", "design", "canvas.css")).toMatch(
      /html\[data-view="obs"\] \.lp-game \{\s*display: none;/,
    );
  });
});
