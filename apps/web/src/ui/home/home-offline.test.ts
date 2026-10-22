import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SOURCE = join(import.meta.dirname, "..", "..");
const HOME_PAGE = join(import.meta.dirname, "home-page.tsx");

// Les imports qui restent dans le JavaScript : `import type` s'efface à la compilation, il ne charge rien.
const RUNTIME_IMPORT =
  /^(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']|^import\s+["']([^"']+)["']/gm;

const resolveFile = (from: string, specifier: string): string | null => {
  if (!specifier.startsWith(".") || /\.css(\?|$)/.test(specifier)) return null;
  const base = resolve(dirname(from), specifier);
  return (
    [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(
      (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
    ) ?? null
  );
};

// Tous les fichiers que la page charge vraiment, de proche en proche : ce qu'un visiteur télécharge pour la voir.
const loadedFiles = (entry: string): Map<string, string> => {
  const files = new Map<string, string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    const source = readFileSync(file, "utf8");
    files.set(file, source);
    for (const [, fromClause, bare] of source.matchAll(RUNTIME_IMPORT)) {
      const next = resolveFile(file, fromClause ?? bare ?? "");
      if (next) pending.push(next);
    }
  }
  return files;
};

const FILES = loadedFiles(HOME_PAGE);
const nameOf = (file: string): string => relative(WEB_SOURCE, file).replaceAll("\\", "/");

describe("the home page stays in the browser (Écart §9.1, JOURNAL 2026-10-22)", () => {
  // Le parcours des imports voit bien la page : ses composants et ceux du design system qu'elle réutilise
  it("follows the imports of the page through its own components and the design system", () => {
    const names = [...FILES.keys()].map(nameOf);

    expect(names).toEqual(
      expect.arrayContaining([
        "ui/home/home-scene.tsx",
        "ui/home/phone-screen.tsx",
        "ui/design/gauge.tsx",
        "ui/design/palette.tsx",
        "ui/draft/draft-labels.ts",
      ]),
    );
    expect(names.length).toBeGreaterThan(25);
  });

  // La page n'importe ni `state/` ni `net/` : aucun magasin du jeu, aucun transport
  it("imports neither state/ nor net/, in its own files or in any file they load", () => {
    const names = [...FILES.keys()].map(nameOf);

    expect(names.filter((name) => /^(state|net)\//.test(name))).toEqual([]);
  });

  // La page n'ouvre aucun WebSocket et n'envoie aucune requête, hors fichiers statiques
  it("opens no WebSocket and sends no request in any file it loads", () => {
    const network = /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest)\b|\bfetch\s*\(|\bsendBeacon\b/;
    const offenders = [...FILES].filter(([, source]) => network.test(source)).map(([file]) => nameOf(file));

    expect(offenders).toEqual([]);
  });
});
