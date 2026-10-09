// Le manifest d'application web d'un canvas (Écart §9.1, JOURNAL 2026-10-08) : « Ajouter à l'écran d'accueil » le rouvre.

import type { DurableStore } from "@liveplace/domain/ports";
import { type CanvasOwner, resolveCanvas } from "../../usecase/resolve-canvas";
import tokensCss from "../design/tokens.css?raw";

export type WebManifestIcon = {
  src: string;
  sizes: string;
  type: "image/png";
  purpose: "any" | "maskable";
};

// Aucun champ `orientation` : le type ne sait pas en imposer une.
export type WebManifest = {
  id: string;
  name: string;
  shortName: string;
  startUrl: string;
  scope: "/";
  display: "standalone";
  backgroundColor: string;
  themeColor: string;
  icons: readonly WebManifestIcon[];
};

const SHORT_NAME_LENGTH = 12; // ce qui tient sous une icône avant que l'écran d'accueil ne coupe

// Une maskable à part : « any maskable » dans une seule icône la rognerait partout.
const ICONS: readonly WebManifestIcon[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

// Le fond du jeu en sombre, lu dans les jetons plutôt que recopié : un manifest n'a qu'une couleur, celle de l'icône.
const DARK_VOID = /\[data-appearance="dark"\]\s*\{[^}]*?--void:\s*(#[0-9a-f]{6})\s*;/i;

function darkVoid(): string {
  const color = DARK_VOID.exec(tokensCss)?.[1];
  if (!color) throw new Error("web-manifest : --void introuvable dans l'apparence sombre de tokens.css");
  return color;
}

export function buildWebManifest({
  login,
  displayName,
}: Pick<CanvasOwner, "login" | "displayName">): WebManifest {
  const color = darkVoid();
  return {
    id: `/${login}`,
    name: `${displayName} · LivePlace`,
    shortName: Array.from(displayName).slice(0, SHORT_NAME_LENGTH).join(""),
    startUrl: `/${login}`,
    scope: "/",
    display: "standalone",
    backgroundColor: color,
    themeColor: color,
    icons: ICONS,
  };
}

// Le standard écrit en snake_case, le code en camelCase : cette table les relie, au seul endroit où le manifest sort.
const STANDARD_NAMES: Record<string, string> = {
  shortName: "short_name",
  startUrl: "start_url",
  backgroundColor: "background_color",
  themeColor: "theme_color",
};

export const toManifestJson = (manifest: WebManifest): string =>
  JSON.stringify(
    Object.fromEntries(Object.entries(manifest).map(([key, value]) => [STANDARD_NAMES[key] ?? key, value])),
  );

// Le canvas existe comme pour la page : sans canvas actif, rien à installer. Le nom change rarement : un jour de cache.
export async function webManifestResponse(
  durable: Pick<DurableStore, "getUserByLogin" | "getActiveCanvasForOwner">,
  login: string,
): Promise<Response> {
  const page = await resolveCanvas(durable, login);
  if (!page) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(toManifestJson(buildWebManifest(page.owner)), {
    status: 200,
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=86400" },
  });
}
