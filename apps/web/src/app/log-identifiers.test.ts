// Le garde-fou des journaux (CDC §8, RGPD, JOURNAL 2026-11-02) : aucun `console.*` du web, du gateway ou du worker n'écrit un
// identifiant, un login, un nom affiché, un e-mail ou une adresse de photo. Un journal Docker garde 3 fichiers de 10 Mo : ce qui y
// entre une fois y reste jusqu'au prochain déploiement, et nomme une personne que l'effacement ne retrouve pas.
// Le test lit le code : il cherche, dans les arguments de chaque appel, ce qui désigne un compte ou la personne (hors du texte des
// chaînes, qui ne porte aucune valeur). Il ne voit pas ce qu'un objet d'erreur contient à l'exécution : un message d'erreur ne doit
// jamais citer les valeurs qu'il refuse, et c'est à celui qui l'écrit.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

// Ce que l'identité d'une personne porte dans le code : l'identifiant et ses pluriels, le pseudo, le nom affiché, la photo, l'e-mail,
// le propriétaire ou le streamer d'un événement, la session, le profil, une commande Twitch (elle porte des comptes, son seul genre
// n'en nomme aucun), une adresse.
const PERSONAL =
  /\b(userId|userIds|login|displayName|avatarUrl|email|ownerId|broadcasterId|session|profile|command(?!\.kind\b)|user|url)\b/g;

// Un appel de journal : `console.` suivi du niveau et de la parenthèse ouvrante.
const CONSOLE_CALL = /\bconsole\.(?:log|info|warn|error|debug)\(/g;

// Saute une chaîne entre guillemets ou apostrophes, après son ouverture ; rend l'index de sa fermeture.
const skipQuoted = (source: string, from: number, quote: string): number => {
  for (let index = from + 1; index < source.length; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === quote) return index;
  }
  return source.length;
};

type Read = { code: string; end: number };

// Les arguments d'un appel, jusqu'à sa parenthèse fermante : le code, sans le texte des chaînes ni les commentaires. Un gabarit garde
// ses `${…}`, car c'est là que passent les valeurs.
const scanCode = (source: string, from: number, close: ")" | "}"): Read => {
  let code = "";
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      code += '""';
    } else if (char === "`") {
      const template = scanTemplate(source, index);
      code += template.code;
      index = template.end;
    } else if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index);
      if (index === -1) index = source.length;
    } else if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2) + 1;
    } else {
      if (char === "(" || char === "{" || char === "[") depth += 1;
      if (char === ")" || char === "}" || char === "]") {
        if (depth === 0 && char === close) return { code, end: index };
        depth -= 1;
      }
      code += char;
    }
  }
  return { code, end: source.length };
};

const scanTemplate = (source: string, from: number): Read => {
  let code = '""';
  for (let index = from + 1; index < source.length; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === "`") return { code, end: index };
    else if (source[index] === "$" && source[index + 1] === "{") {
      const inner = scanCode(source, index + 2, "}");
      code += ` ${inner.code} `;
      index = inner.end;
    }
  }
  return { code, end: source.length };
};

// Chaque appel de journal du code, avec ce qu'il désigne de personnel : `[ligne, mots trouvés]`.
export const findPersonalLogs = (source: string): { line: number; words: string[] }[] =>
  [...source.matchAll(CONSOLE_CALL)].flatMap((call) => {
    const start = (call.index ?? 0) + call[0].length;
    const words = [...new Set(scanCode(source, start, ")").code.match(PERSONAL) ?? [])];
    return words.length === 0 ? [] : [{ line: source.slice(0, start).split("\n").length, words }];
  });

const SKIPPED_FOLDERS = new Set(["node_modules", "dist", ".output", "_generated", ".claude"]);

const listSources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : listSources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|gen)\.tsx?$/.test(entry.name) ? [path] : [];
  });

const SOURCE_FOLDERS = [
  ...["gateway", "web", "worker"].map((app) => join(ROOT, "apps", app, "src")),
  ...["domain", "durable", "protocol", "redis-core", "shared"].map((name) => join(ROOT, "packages", name)),
];

describe("what the logs may say (CDC §8, RGPD)", () => {
  // Aucun appel de journal du code n'écrit un compte, un pseudo, un nom affiché, un e-mail ni l'adresse d'une photo
  it("finds no console call that writes an account, a login, a name, an email or a photo address", () => {
    const sources = SOURCE_FOLDERS.flatMap(listSources);
    const calls = sources.reduce(
      (count, path) => count + [...readFileSync(path, "utf8").matchAll(CONSOLE_CALL)].length,
      0,
    );
    const found = sources.flatMap((path) =>
      findPersonalLogs(readFileSync(path, "utf8")).map(
        ({ line, words }) =>
          `${relative(ROOT, path).replaceAll("\\", "/")}:${line} écrit ${words.join(", ")}`,
      ),
    );

    // Le test lit vraiment le code : des dizaines de fichiers, des dizaines d'appels.
    expect(sources.length).toBeGreaterThan(100);
    expect(calls).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });

  // Le garde-fou voit un identifiant dans un gabarit, un objet passé en entier, un nom en argument, et jusque dans un gabarit imbriqué
  it("sees an identifier in a template, a whole object, a bare argument, and a nested template", () => {
    const flagged = (code: string) => findPersonalLogs(code).flatMap(({ words }) => words);

    expect(flagged("console.error(`twitch live : suivi de ${userId} impossible`, error);")).toEqual([
      "userId",
    ]);
    expect(flagged('console.error("gateway: action Twitch non appliquée", command, error);')).toEqual([
      "command",
    ]);
    expect(flagged("console.warn(`photo ${url} non chargée`);")).toEqual(["url"]);
    expect(flagged("console.info(`a ${items.map((item) => `${item.login}`).join()}`);")).toEqual(["login"]);
    expect(flagged("console.error(`mail ${user.email}`);")).toEqual(["user", "email"]);
    expect(flagged("console.error('x', session.displayName);")).toEqual(["session", "displayName"]);
  });

  // Il laisse passer ce qui n'est pas une personne : un texte qui parle de login, un canvas, une erreur, une durée, une adresse de configuration
  it("lets through the words in a text, a canvas, an error, a duration and a configuration address", () => {
    const flagged = (code: string) => findPersonalLogs(code).flatMap(({ words }) => words);

    expect(flagged('console.error("le login a échoué, userId absent", error);')).toEqual([]);
    expect(flagged("console.error(`canvases : miniature de ${canvasId} non lue`, error);")).toEqual([]);
    expect(flagged("console.info(`EventSub sauté : ${reason}`, callbackUrl);")).toEqual([]);
    expect(flagged("console.error(`capacité : ${label} en ${elapsedMs} ms`);")).toEqual([]);
    expect(flagged("console.error(`action Twitch non appliquée (${command.kind})`, error);")).toEqual([]);
    expect(flagged("console.error('un // commentaire dans une chaîne', error); // userId")).toEqual([]);
  });

  // Il reporte la ligne de l'appel fautif
  it("reports the line of the faulty call", () => {
    expect(findPersonalLogs("a();\n\nconsole.error(userId);\n")).toEqual([{ line: 3, words: ["userId"] }]);
  });
});
