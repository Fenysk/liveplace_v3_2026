#!/usr/bin/env node
// CHECK 1 — Architecture. Les couches et leurs dépendances autorisées sont des
// DONNÉES (.agent/project/architecture.json), pas de la prose. Ce fichier les fait
// respecter. Une règle d'architecture qui n'échoue pas n'est pas une règle.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { walk, extractImports, resolveSpecifier, globToRegExp, loadJson, toPosix, report, fail } from "../lib/scan.mjs";

const cwd = process.cwd();
const arch = loadJson(join(cwd, ".agent/project/architecture.json"));
// Un check vert par absence de configuration est PIRE que pas de check : il donne
// la sensation d'être couvert sans rien vérifier. Le socle installé mais non
// configuré doit échouer bruyamment.
if (!arch) fail("architecture — .agent/project/architecture.json absent.\n  Le socle est installé mais pas configuré : décrire les couches réelles du projet.");
if (!Array.isArray(arch.layers) || arch.layers.length === 0) fail("architecture — aucune couche déclarée dans architecture.json.");

/**
 * Tranches verticales. Une architecture en couches horizontales éparpille UNE feature
 * sur six dossiers ; l'agent doit alors charger six fichiers sans rapport pour en
 * modifier un, et c'est là qu'il se met à inventer. Déclarer `expand` engendre une
 * couche par sous-dossier, ce qui rend l'invariant central du découpage vertical
 * mécaniquement vrai : une tranche n'importe jamais une tranche voisine.
 */
const expand = (defs) => {
  const out = [];
  for (const l of defs) {
    if (!l.expand) { out.push(l); continue; }
    const base = l.expand.replace(/\/\*$/, "");
    if (!existsSync(join(cwd, base))) continue;
    for (const entry of readdirSync(join(cwd, base))) {
      if (!statSync(join(cwd, base, entry)).isDirectory()) continue;
      const { expand: _, ...rest } = l;
      out.push({ ...rest, name: `${l.name}:${entry}`, match: `${base}/${entry}/**`, group: l.name });
    }
  }
  return out;
};

// `match` accepte une chaîne OU un tableau : une couche vit rarement dans un seul dossier
// (les routes d'un framework, un point d'entrée à la racine…). Sans ça, on est poussé à
// créer une couche artificielle par dossier, et le découpage cesse de dire la vérité.
const layers = expand(arch.layers).map((l) => {
  const globs = Array.isArray(l.match) ? l.match : [l.match];
  const res = globs.map(globToRegExp);
  return { ...l, re: { test: (f) => res.some((r) => r.test(f)) }, fileRe: l.filename ? new RegExp(l.filename) : null };
});
const allowlist = new Set((arch.rules?.unlayeredFilesAllowed ?? []).map(toPosix));
const aliases = arch.aliases ?? {};
const root = arch.root ?? "src";
const files = walk(join(cwd, root)).map((f) => toPosix(f.slice(cwd.length + 1)));
if (files.length === 0) fail(`architecture — aucun fichier de code sous « ${root} ».\n  Soit \`root\` est faux dans architecture.json, soit le gate tourne au mauvais endroit. Dans les deux cas il ne prouve rien.`);

const layerOf = (f) => layers.find((l) => l.re.test(f))?.name ?? null;

const violations = [];
const graph = new Map();
const imported = new Set();

for (const file of files) {
  const from = layerOf(file);

  // 1. Aucun fichier hors couche. C'est CE check qui empêche l'agent d'inventer
  //    `src/utils/` à 2 h du matin : le dossier n'existe pas dans l'architecture,
  //    donc le fichier n'a pas le droit d'exister.
  if (!from && !allowlist.has(file)) {
    violations.push(`${file} — hors de toute couche déclarée. Le placer dans une couche existante, ou déclarer la couche dans architecture.json (= une décision, donc une ligne de JOURNAL).`);
    continue;
  }

  // 2. Convention de nom par couche.
  const layer = layers.find((l) => l.name === from);
  if (layer?.fileRe && !layer.fileRe.test(basename(file))) {
    violations.push(`${file} — nom non conforme à la couche « ${from} » (attendu : ${layer.filename}).`);
  }

  // 3. Sens des dépendances.
  const src = readFileSync(join(cwd, file), "utf8");
  const deps = [];
  for (const spec of extractImports(src)) {
    const target = resolveSpecifier(spec, join(cwd, file), cwd, aliases);
    if (!target) continue;
    deps.push(target);
    imported.add(target);
    const to = layerOf(target);
    if (!to || to === from) continue;
    const toLayer = layers.find((l) => l.name === to);
    // `canImport: ["feature"]` autorise toutes les tranches engendrées : on cite le
    // GROUPE, pas chaque tranche — sinon ajouter une feature obligerait à éditer
    // architecture.json, et une règle qu'il faut maintenir à la main finit non maintenue.
    const allowed = layer?.canImport ?? [];
    if (!allowed.includes(to) && !(toLayer?.group && allowed.includes(toLayer.group))) {
      const sibling = layer?.group && layer.group === toLayer?.group;
      violations.push(
        sibling
          ? `${file} → ${target} : deux tranches verticales (« ${from} » et « ${to} ») ne s'importent JAMAIS entre elles. Ce qui est commun remonte dans une couche partagée ; sinon les tranches fusionnent et le découpage ne sert plus à rien.`
          : `${file} → ${target} : la couche « ${from} » ne peut pas importer « ${to} ». Autorisé : ${(layer?.canImport ?? []).join(", ") || "(aucune)"}.`
      );
    }
  }
  graph.set(file, deps);
}

// 4. Cycles. Un cycle rend tout raisonnement local faux et bloque tout refactoring
//    futur : c'est la forme la plus coûteuse de dérive.
if (arch.rules?.noCycles !== false) {
  const state = new Map();
  const stack = [];
  const seen = new Set();
  const visit = (n) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) {
      const cycle = stack.slice(stack.indexOf(n)).concat(n);
      const key = [...cycle].sort().join("|");
      if (!seen.has(key)) {
        seen.add(key);
        violations.push(`cycle : ${cycle.join(" → ")}`);
      }
      return;
    }
    state.set(n, 1);
    stack.push(n);
    for (const d of graph.get(n) ?? []) visit(d);
    stack.pop();
    state.set(n, 2);
  };
  for (const n of graph.keys()) visit(n);
}

// 5. Orphelins. Du code que personne n'importe est soit mort, soit un doublon de
//    quelque chose qui, lui, est importé. Les deux cas sont de la dérive.
if (arch.rules?.noOrphans) {
  const entryRes = (arch.rules.entryPoints ?? []).map(globToRegExp);
  for (const file of files) {
    if (imported.has(file) || entryRes.some((re) => re.test(file)) || allowlist.has(file)) continue;
    violations.push(`${file} — orphelin : aucun fichier ne l'importe. Le brancher, le supprimer, ou le déclarer point d'entrée.`);
  }
}

process.exit(report("architecture", violations, { hint: "Ne jamais élargir `canImport` pour faire passer le gate. Soit le code change de place, soit c'est une décision d'architecture — et une décision s'écrit dans JOURNAL.md avant de toucher architecture.json." }));
