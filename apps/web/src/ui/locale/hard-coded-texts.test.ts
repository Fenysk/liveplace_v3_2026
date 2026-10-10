// Le garde-fou de la langue (Écart §14, JOURNAL 2026-10-07) : une phrase française oubliée en dur dans un composant
// ne se voit qu'en passant la page en anglais. Ce test la trouve avant : il lit les chaînes et le texte JSX du code
// de l'interface, hors commentaires, et refuse ce qui est du français.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SOURCE = join(import.meta.dirname, "..", "..");

// Restent en français, voulu : la fenêtre Développeur et ses composants, la page /design autour des composants, et
// le mécanisme lui-même (le nom des langues s'écrit dans chacune).
const FRENCH_BY_DESIGN = [
  "ui/developer/",
  "ui/design-page/",
  "ui/locale/",
  "ui/design/canvas-activity-card.tsx",
  "ui/design/capacity-row.tsx",
  "ui/design/stat-table.tsx",
  "ui/design/stat-tile.tsx",
  "ui/design/time-charts.tsx",
  "ui/design/time-chart-scale.ts",
  "ui/design/variable-specimen.tsx",
];
// Le titre du bouton Développeur : Alexis seul le voit.
const FRENCH_TEXTS = new Set(["Développeur"]);
// Le français des textes du développeur dans le code : journaux et erreurs ne sont pas de l'interface.
const NOT_INTERFACE_LINE = /console\.\w+\(|new Error\(/;

const ACCENTED = /[àâçéèêëîïôùûüœÀÂÇÉÈÊËÎÏÔÙÛÜŒ]/;
// Des mots de liaison français, et les mots d'interface qu'aucune phrase anglaise n'écrit (pas « archive » ni « pixel »).
const FRENCH_WORD = new RegExp(
  `\\b(${[
    "le|la|les|un|une|des|du|pour|avec|sur|est|sont|et|ou|pas|cette|tu|ton|ta|tes|dans|vous|nous|votre|qui|que",
    "se|ses|son|leur|leurs|aucun|aucune",
    "fermer|annuler|valider|supprimer|rouvrir|archiver|bannir|signaler|copier|recharger|connecter|retirer|dessiner",
    "chargement|connexion|compte|gomme|pipette|taille|nom|jauge|jauges",
  ].join("|")})\\b`,
  "i",
);

const isFrench = (text: string): boolean => ACCENTED.test(text) || FRENCH_WORD.test(text);

// Retire les commentaires sans toucher aux chaînes : `//` dans une URL de chaîne n'en est pas un.
const stripComments = (source: string): string => {
  let out = "";
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index] ?? "";
    const next = source[index + 1];
    if (quote) {
      out += char;
      if (char === "\\") out += source[++index] ?? "";
      else if (char === quote) quote = null;
    } else if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index++;
      out += "\n";
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 1;
      out += " ";
    } else {
      if (char === '"' || char === "'" || char === "`") quote = char;
      out += char;
    }
  }
  return out;
};

// Les chaînes (guillemets, apostrophes, gabarits sans leurs `${}`) et le texte entre balises JSX.
const STRING_LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const JSX_TEXT = />([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g;

const listTexts = (source: string): string[] => {
  const code = stripComments(source)
    .split("\n")
    .filter((line) => !NOT_INTERFACE_LINE.test(line))
    .join("\n");
  const strings = [...code.matchAll(STRING_LITERAL)].map(([, double, single, template]) =>
    (double ?? single ?? template ?? "").replace(/\$\{[^}]*\}/g, " "),
  );
  // Les `{…}` d'une expression JSX coupent le texte : « Canvas de {name} » doit rester un seul texte.
  let withoutExpressions = code.replace(STRING_LITERAL, '""');
  for (let previous = ""; previous !== withoutExpressions; ) {
    previous = withoutExpressions;
    withoutExpressions = withoutExpressions.replace(/\{[^{}]*\}/g, " ");
  }
  const jsx = [...withoutExpressions.matchAll(JSX_TEXT)].map(([, text]) => text ?? "");
  return [...strings, ...jsx].map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
};

const listSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const INTERFACE_FILES = listSourceFiles(WEB_SOURCE)
  .map((path) => ({ path, name: relative(WEB_SOURCE, path).replaceAll("\\", "/") }))
  .filter(
    ({ name }) =>
      /^(ui|routes)\//.test(name) &&
      !/\.(test|gen)\.tsx?$/.test(name) &&
      !/-texts\.ts$/.test(name) &&
      !FRENCH_BY_DESIGN.some((french) => name.startsWith(french)),
  );

describe("the French left in the code of the interface (Écart §14, JOURNAL 2026-10-07)", () => {
  // Quand une phrase française est écrite en dur hors d'un module de textes, le système doit la refuser
  it("finds no French sentence outside the text modules", () => {
    const found = INTERFACE_FILES.flatMap(({ path, name }) =>
      listTexts(readFileSync(path, "utf8"))
        .filter((text) => isFrench(text) && !FRENCH_TEXTS.has(text))
        .map((text) => `${name} : ${text}`),
    );

    expect(INTERFACE_FILES.length).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });

  // Le garde-fou voit ce qu'il doit voir : une chaîne, un attribut, un texte JSX, un gabarit, mais pas un commentaire
  it("reads a string, an attribute, a JSX text and a template, but not a comment", () => {
    const source = [
      "// Une phrase dans un commentaire, ignorée.",
      'const title = "Se connecter";',
      `const label = \`Voir le canvas de $\{name}\`;`,
      'const link = "https://liveplace.tv/kalyss";',
      'console.warn("Une erreur pour le développeur", error);',
      '<a href="/x" title="Fermer">Réessayer</a>;',
      "<p>Hello there</p>;",
    ].join("\n");
    const texts = listTexts(source);

    expect(texts).toEqual(
      expect.arrayContaining(["Se connecter", "Voir le canvas de", "Fermer", "Réessayer"]),
    );
    expect(texts.filter(isFrench)).toEqual(
      expect.arrayContaining(["Se connecter", "Voir le canvas de", "Fermer", "Réessayer"]),
    );
    expect(texts.some((text) => text.includes("commentaire"))).toBe(false);
    expect(texts.some((text) => text.includes("développeur"))).toBe(false);
    expect(isFrench("Hello there")).toBe(false);
    expect(isFrench("https://liveplace.tv/kalyss")).toBe(false);
  });
});
