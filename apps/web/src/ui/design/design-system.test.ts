// Le garde-fou du design system (JOURNAL 2026-09-24) : une consigne s'oublie, le gate non.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SOURCE = join(import.meta.dirname, "..", "..");
const DESIGN_SYSTEM = "ui/design/";
const DESIGN_PAGE = "ui/design-page/";

type SourceFile = { path: string; text: string };

const listSourceFiles = (directory: string): SourceFile[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) return [];
    return [{ path: relative(WEB_SOURCE, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }];
  });

const SOURCES = listSourceFiles(WEB_SOURCE);
// Une couleur écrite dans une chaîne : `#fff`, `#10121c`, `rgb(`, `rgba(`, `hsl(`.
const COLOR_LITERAL = /["'`]\s*(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i;
const EXPORTED_COMPONENT = /export const ([A-Z]\w*) = /g;

const offending = (pattern: RegExp, files: readonly SourceFile[]) =>
  files.filter(({ text }) => pattern.test(text)).map(({ path }) => path);

describe("le design system (JOURNAL 2026-09-24)", () => {
  // Hors du design system, un composant porte des classes : jamais de `style`, qui échapperait aux tokens
  it("keeps `style` inside the design system", () => {
    const outside = SOURCES.filter(({ path }) => path.endsWith(".tsx") && !path.startsWith(DESIGN_SYSTEM));
    expect(offending(/\sstyle=\{/, outside)).toEqual([]);
  });

  // Une couleur vient de tokens.css ou de la palette de `domain`, jamais d'une chaîne dans le code du web
  it("writes no color in the web code", () => {
    expect(offending(COLOR_LITERAL, SOURCES)).toEqual([]);
  });

  // /design montre tout : chaque composant du design system et chaque pill du jeu y est rendu
  it("shows every design system component and every game pill on /design", () => {
    const shown = SOURCES.filter(({ path }) => path.startsWith(DESIGN_PAGE))
      .map(({ text }) => text)
      .join("\n");
    const components = SOURCES.filter(
      ({ path }) => (path.startsWith(DESIGN_SYSTEM) && path.endsWith(".tsx")) || path.endsWith("-pill.tsx"),
    ).flatMap(({ text }) => [...text.matchAll(EXPORTED_COMPONENT)].map(([, name]) => name));
    const missing = components.filter((name) => !shown.includes(`<${name}`));
    expect(components.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
