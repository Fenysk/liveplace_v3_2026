#!/usr/bin/env node
// CHECK 2 — Nomenclature. La dérive de nomenclature n'est pas un problème d'esthétique :
// c'est la CAUSE de la duplication. Un agent qui ne retrouve pas `getUser` écrit
// `fetchUserData`, et le dépôt contient désormais deux fois la même chose sous deux noms.
// Ce check ne regarde QUE les déclarations — les noms que l'agent invente —, jamais les usages.
import { readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { walk, stripNoise, globToRegExp, loadJson, toPosix, report, fail } from "../lib/scan.mjs";

const cwd = process.cwd();
const lex = loadJson(join(cwd, ".agent/project/lexique.json"));
if (!lex) fail("lexique — .agent/project/lexique.json absent.\n  Le socle est installé mais pas configuré : poser 5 à 10 termes du domaine.");

const arch = loadJson(join(cwd, ".agent/project/architecture.json"));
const ignoreRes = (lex.ignore ?? []).map(globToRegExp);

const DECLARATIONS = [
  /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/g,
  /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g,
];
const BOOLEAN_DECL = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*:\s*boolean\b|^\s*([a-z][\w$]*)\??\s*:\s*boolean\b/gm;

const words = (id) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

// Index inversé : synonyme interdit → terme canonique.
const bannedNoun = new Map();
for (const t of lex.nouns ?? []) for (const b of t.banned ?? []) bannedNoun.set(b.toLowerCase(), t.canonical);
const bannedVerb = new Map();
for (const v of lex.verbs ?? []) for (const b of v.banned ?? []) bannedVerb.set(b.toLowerCase(), v.canonical);
const bannedName = new Set((lex.bannedNames ?? []).map((n) => n.toLowerCase()));
const boolPrefixes = (lex.booleanPrefixes ?? []).map((p) => p.toLowerCase());

const violations = [];
const files = walk(join(cwd, arch?.root ?? "src")).map((f) => toPosix(f.slice(cwd.length + 1)));

for (const file of files) {
  if (ignoreRes.some((re) => re.test(file))) continue;
  const raw = readFileSync(join(cwd, file), "utf8");
  const src = stripNoise(raw); // commentaires et chaînes retirés : zéro faux positif sur du texte d'UI

  // a. Nom de fichier — première ligne de défense, la plus visible.
  const stem = basename(file, extname(file));
  for (const w of words(stem)) {
    if (bannedName.has(w)) violations.push(`${file} — nom de fichier générique « ${w} ». Un fichier fourre-tout devient le dépotoir où l'agent range ce qu'il ne sait pas classer. Nommer par la responsabilité réelle.`);
    else if (bannedNoun.has(w)) violations.push(`${file} — « ${w} » n'est pas le terme du domaine : utiliser « ${bannedNoun.get(w)} ».`);
  }

  // b. Identifiants déclarés.
  for (const re of DECLARATIONS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const id = m[1];
      const ws = words(id);
      const at = `${file}:${lineOf(src, m.index)}`;
      for (const w of ws) {
        if (bannedName.has(w)) violations.push(`${at} — « ${id} » contient « ${w} », mot vide interdit. Nommer ce que ça fait, pas ce que c'est.`);
        else if (bannedNoun.has(w)) violations.push(`${at} — « ${id} » : dire « ${bannedNoun.get(w)} » et non « ${w} » (terme du lexique).`);
      }
      // Le verbe ne compte qu'en tête : `getUser` ✓, `userGet` n'est pas un appel d'action.
      if (ws.length > 1 && bannedVerb.has(ws[0])) {
        violations.push(`${at} — « ${id} » : le verbe canonique est « ${bannedVerb.get(ws[0])} », pas « ${ws[0]} ». Deux verbes pour une action = deux implémentations à terme.`);
      }
    }
  }

  // c. Booléens : un booléen mal nommé se lit comme une donnée et finit dupliqué en `xxxFlag`.
  if (boolPrefixes.length) {
    BOOLEAN_DECL.lastIndex = 0;
    let m;
    while ((m = BOOLEAN_DECL.exec(src)) !== null) {
      const id = m[1] ?? m[2];
      if (!id) continue;
      const first = words(id)[0];
      if (!boolPrefixes.includes(first)) {
        violations.push(`${file}:${lineOf(src, m.index)} — booléen « ${id} » : préfixer par ${boolPrefixes.join(" / ")}.`);
      }
    }
  }
}

process.exit(
  report("lexique", violations, {
    hint: "Si un terme manque au lexique, l'ajouter dans .agent/project/lexique.json est une décision de domaine : elle s'écrit d'abord dans JOURNAL.md. Ajouter un synonyme « juste pour cette fois » est exactement le mécanisme de la dérive.",
  })
);
