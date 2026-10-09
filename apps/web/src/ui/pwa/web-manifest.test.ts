import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@liveplace/domain";
import type { DurableStore, OwnedCanvas } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { buildWebManifest, webManifestResponse } from "./web-manifest";

// Écart §9.1 (JOURNAL 2026-10-08) : le manifest d'application web d'un canvas.

const WEB_ROOT = join(import.meta.dirname, "..", "..", "..");
const owner: User = { userId: "1234", login: "fenysk", displayName: "Fenysk", avatarUrl: "" };
const canvas: OwnedCanvas = { canvasId: "opaque-canvas", width: 50, height: 50 };

const durableWith = (
  user: User | null,
): Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner"> => ({
  getUserByLogin: async (login) => (user && login === user.login ? user : null),
  getActiveCanvasForOwner: async () => canvas,
});

// Le fond du jeu en sombre, relu dans tokens.css à part du code testé
const darkVoid = (): string => {
  const tokens = readFileSync(join(import.meta.dirname, "..", "design", "tokens.css"), "utf8");
  const dark = tokens.slice(tokens.indexOf('[data-appearance="dark"]'));
  return /--void:\s*(#[0-9a-f]{6})/i.exec(dark)?.[1] ?? "";
};

// Largeur, hauteur et type de couleur d'un PNG, lus dans son en-tête IHDR (2 : RGB sans alpha, 6 : RGBA)
const getPngHeader = (name: string) => {
  const bytes = readFileSync(join(WEB_ROOT, "public", name));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
};

describe("le manifest d'application web d'un canvas (Écart §9.1, JOURNAL 2026-10-08)", () => {
  // Quand on ajoute la page à l'écran d'accueil, l'icône rouvre CE canvas, en plein écran, et sans orientation imposée
  it("reopens the very canvas it was installed from, full screen, with no orientation", () => {
    const manifest = buildWebManifest(owner);

    expect(manifest).toMatchObject({
      id: "/fenysk",
      startUrl: "/fenysk",
      scope: "/",
      display: "standalone",
    });
    expect(manifest).not.toHaveProperty("orientation");
  });

  // Le nom dit de quel streamer est l'icône, et le nom court tient sous une icône
  it("names the streamer, with a short name that fits under an icon", () => {
    const long = buildWebManifest({ login: "unpseudoassezlong", displayName: "UnPseudoAssezLong" });

    expect(buildWebManifest(owner).name).toBe("Fenysk · LivePlace");
    expect(buildWebManifest(owner).shortName).toBe("Fenysk");
    expect(long.shortName).toBe("UnPseudoAsse");
  });

  // Le fond et la barre prennent le fond du jeu en sombre (--void de tokens.css), jamais une couleur écrite à part
  it("takes its colors from the dark game background of tokens.css", () => {
    const { backgroundColor, themeColor } = buildWebManifest(owner);

    expect(darkVoid()).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backgroundColor).toBe(darkVoid());
    expect(themeColor).toBe(darkVoid());
  });

  // Les icônes que Chrome exige (192, 512), et une maskable à part, dont les fichiers existent à la taille dite
  it("declares the 192 and 512 icons and a separate maskable one, each file at its declared size", () => {
    const { icons } = buildWebManifest(owner);

    expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
    for (const { src, sizes } of icons) {
      const { width, height } = getPngHeader(src.slice(1));
      expect(`${width}x${height}`).toBe(sizes);
    }
  });

  // L'icône maskable et celle d'Apple pleine page, sans transparence : Android la masque, iOS peint le transparent en noir
  it("keeps the maskable and the Apple touch icons full-bleed, with no transparency", () => {
    expect(getPngHeader("icon-maskable-512.png").colorType).toBe(2);
    expect(getPngHeader("apple-touch-icon.png")).toEqual({ width: 180, height: 180, colorType: 2 });
  });

  // Quand le pseudo a un canvas, la réponse est un manifest, et le pseudo en capitales rouvre le même canvas
  it("answers a canvas login with its manifest, and a capitalized one with the same canvas", async () => {
    const response = await webManifestResponse(durableWith(owner), "Fenysk");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    const text = await response.text();
    // Les noms du standard sont en snake_case
    for (const written of [
      '"id":"/fenysk"',
      '"short_name":"Fenysk"',
      '"start_url":"/fenysk"',
      '"display":"standalone"',
      `"theme_color":"${darkVoid()}"`,
      `"background_color":"${darkVoid()}"`,
    ])
      expect(text).toContain(written);
    expect(text).not.toContain("orientation");
  });

  // Si le pseudo n'a pas de canvas, il n'y a rien à installer : 404, qu'aucun cache ne retient
  it("answers 404, kept by no cache, when the login has no canvas", async () => {
    const response = await webManifestResponse(durableWith(null), "inconnu");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
