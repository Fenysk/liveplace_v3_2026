import { describe, expect, it } from "vitest";
import { Route as GameRoute } from "../../routes/$login";
import { Route as ObsRoute } from "../../routes/$login_.obs";

// Écart §9.1 (JOURNAL 2026-10-08) : les balises qui rendent la page du jeu installable.

const owner = { login: "fenysk", displayName: "Fenysk" };
const gameHead = async (loaderData: unknown) => await GameRoute.options.head?.({ loaderData } as never);

describe("la page du jeu, installable (Écart §9.1, JOURNAL 2026-10-08)", () => {
  // Quand la page d'un canvas se charge, le navigateur trouve le manifest de CE canvas et l'icône d'Apple
  it("links the manifest of its own canvas and the Apple touch icon", async () => {
    const head = await gameHead({ canvasId: "opaque-canvas", owner });

    expect(head?.links).toEqual([
      { rel: "manifest", href: "/fenysk/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ]);
  });

  // Safari lit ses propres balises : plein écran, barre d'état qui ne couvre pas le jeu, et le nom sous l'icône
  it("tells Safari to open full screen, under an opaque status bar, named after the streamer", async () => {
    const meta = (await gameHead({ canvasId: "opaque-canvas", owner }))?.meta;

    expect(meta).toContainEqual({ name: "apple-mobile-web-app-capable", content: "yes" });
    expect(meta).toContainEqual({ name: "mobile-web-app-capable", content: "yes" });
    expect(meta).toContainEqual({ name: "apple-mobile-web-app-status-bar-style", content: "default" });
    expect(meta).toContainEqual({ name: "apple-mobile-web-app-title", content: "Fenysk" });
  });

  // Le routeur ne garde qu'une balise par nom (ou par propriété pour la carte d'aperçu) : deux balises pareilles en feraient disparaître une
  it("gives each meta tag its own name or property, as the router keeps one tag per name", async () => {
    const meta = (await gameHead({ canvasId: "opaque-canvas", owner }))?.meta ?? [];
    const names = meta.map((tag) => tag?.name ?? (tag && "property" in tag ? tag.property : undefined));

    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  // Tant que la page n'a pas son canvas (introuvable), elle n'annonce aucune application
  it("announces no application while the page has no canvas", async () => {
    expect(await gameHead(undefined)).toEqual({});
  });

  // La vue OBS forcée ne change rien : elle ne porte aucune balise d'application
  it("adds nothing to the forced OBS view", () => {
    expect(ObsRoute.options.head).toBeUndefined();
  });
});
