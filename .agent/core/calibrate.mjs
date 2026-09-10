#!/usr/bin/env node
// CALIBRAGE — lit le dépôt tel qu'il est et PROPOSE une configuration du socle.
//
// Partage du travail, tiré de la règle du socle : ce qui est mécanique est un script,
// ce qui demande un jugement reste à l'agent. Ici, mesurer les couches réelles, le sens
// réel des imports, le taux de duplication réel et les familles de synonymes réellement
// employées est mécanique. Décider lequel des deux verbes est le bon ne l'est pas.
//
// Ce script n'écrit JAMAIS par-dessus une configuration existante : il écrit des
// fichiers `*.proposed.json` à côté, et laisse le dernier mot à l'humain ou à l'agent.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { walk, stripNoise, extractImports, resolveSpecifier, toPosix } from "./lib/scan.mjs";

const cwd = process.cwd();
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const ROOT = arg("--root", ["src", "app", "lib", "source"].find((d) => existsSync(join(cwd, d))) ?? "src");

if (!existsSync(join(cwd, ROOT))) {
  console.log(`✘ Répertoire « ${ROOT} » introuvable. Relancer avec --root <dossier>.`);
  process.exit(1);
}

// Alias : on lit tsconfig plutôt que de deviner.
let aliases = { "@/*": `${ROOT}/*` };
for (const f of ["tsconfig.json", "jsconfig.json"]) {
  if (!existsSync(join(cwd, f))) continue;
  try {
    const raw = readFileSync(join(cwd, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
    const paths = JSON.parse(raw)?.compilerOptions?.paths;
    if (paths) aliases = Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  } catch { /* tsconfig exotique : on garde le défaut plutôt que d'échouer */ }
}

const files = walk(join(cwd, ROOT)).map((f) => toPosix(f.slice(cwd.length + 1)));
if (files.length === 0) { console.log(`✘ Aucun fichier de code sous « ${ROOT} ».`); process.exit(1); }

// ── 1. Couches candidates = dossiers de premier niveau. C'est le découpage que le
//       projet s'est déjà donné ; le socle part de la réalité, pas d'un idéal.
const topDirs = readdirSync(join(cwd, ROOT)).filter((e) => statSync(join(cwd, ROOT, e)).isDirectory());
const layerOf = (f) => { const p = f.slice(ROOT.length + 1).split("/"); return p.length > 1 && topDirs.includes(p[0]) ? p[0] : null; };

// ── 2. Sens RÉEL des imports, mesuré.
const edges = new Map();      // "from→to" → nombre
const perLayerFiles = new Map();
for (const file of files) {
  const from = layerOf(file);
  if (!from) continue;
  perLayerFiles.set(from, [...(perLayerFiles.get(from) ?? []), file]);
  for (const spec of extractImports(readFileSync(join(cwd, file), "utf8"))) {
    const target = resolveSpecifier(spec, join(cwd, file), cwd, aliases);
    const to = target && layerOf(target);
    if (!to || to === from) continue;
    edges.set(`${from}→${to}`, (edges.get(`${from}→${to}`) ?? 0) + 1);
  }
}

// ── 3. Convention de nom dominante par couche : proposée seulement si ≥ 70 % des
//       fichiers la respectent déjà — sinon on impose une règle que le dépôt viole.
const SUFFIX = /\.([a-z]+)\.(ts|tsx)$/;
const filenameRule = (layerFiles) => {
  const counts = new Map();
  for (const f of layerFiles) { const m = basename(f).match(SUFFIX); if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1); }
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return best && n / layerFiles.length >= 0.7 ? `^[a-z0-9-]+\\.${best}\\.tsx?$` : null;
};

const layers = topDirs.map((name) => {
  const lf = perLayerFiles.get(name) ?? [];
  const canImport = topDirs.filter((t) => t !== name && edges.has(`${name}→${t}`));
  const rule = filenameRule(lf);
  return { name, match: `${ROOT}/${name}/**`, canImport, ...(rule ? { filename: rule } : {}), _files: lf.length };
});

// ── 4. Cycles entre couches : les seules dépendances qu'on signale d'office comme
//       douteuses, parce qu'une flèche dans les deux sens n'est jamais une intention.
const mutual = [];
for (const key of edges.keys()) {
  const [a, b] = key.split("→");
  if (edges.has(`${b}→${a}`) && a < b) mutual.push([a, b, edges.get(`${a}→${b}`), edges.get(`${b}→${a}`)]);
}

// ── 5. Duplication actuelle, pour poser un seuil qui ne casse pas tout dès le jour 1.
const { execSync } = await import("node:child_process");
let dupPercent = null;
try {
  const out = execSync(`node "${join(import.meta.dirname, "checks/duplication.mjs")}"`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  dupPercent = parseFloat(out.match(/duplication : ([\d.]+) %/)?.[1] ?? "");
} catch (e) {
  dupPercent = parseFloat((e.stdout ?? "").match(/duplication : ([\d.]+) %/)?.[1] ?? "");
}

// ── 6. Familles de synonymes RÉELLEMENT employées. Le script compte, il ne tranche pas.
const FAMILIES = {
  get: ["get", "fetch", "retrieve", "load", "read", "find", "select"],
  list: ["list", "getall", "fetchall", "index", "search", "browse"],
  create: ["create", "add", "insert", "save", "store", "register", "make"],
  update: ["update", "edit", "modify", "patch", "change", "set"],
  delete: ["delete", "remove", "destroy", "erase", "drop", "archive"],
  to: ["to", "convert", "transform", "serialize", "format", "parse", "map"],
  assert: ["assert", "check", "verify", "ensure", "validate", "guard"],
};
const GENERIC = ["util", "utils", "helper", "helpers", "manager", "handler", "data", "info", "misc", "common", "wrapper", "stuff", "temp"];
const EXPORTED = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const words = (id) => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean).map((w) => w.toLowerCase());

const verbHits = new Map(), nounHits = new Map(), genericHits = new Map();
for (const file of files) {
  const src = stripNoise(readFileSync(join(cwd, file), "utf8"));
  for (const w of words(basename(file, extname(file)))) if (GENERIC.includes(w)) genericHits.set(w, (genericHits.get(w) ?? 0) + 1);
  EXPORTED.lastIndex = 0;
  let m;
  while ((m = EXPORTED.exec(src)) !== null) {
    const ws = words(m[1]);
    if (ws.length > 1) for (const [fam, members] of Object.entries(FAMILIES)) if (members.includes(ws[0])) verbHits.set(`${fam}|${ws[0]}`, (verbHits.get(`${fam}|${ws[0]}`) ?? 0) + 1);
    for (const w of ws) {
      if (GENERIC.includes(w)) genericHits.set(w, (genericHits.get(w) ?? 0) + 1);
      else if (w.length > 3 && !Object.values(FAMILIES).flat().includes(w)) nounHits.set(w, (nounHits.get(w) ?? 0) + 1);
    }
  }
}
const conflicts = Object.keys(FAMILIES)
  .map((fam) => ({ fam, used: [...verbHits.entries()].filter(([k]) => k.startsWith(fam + "|")).map(([k, n]) => [k.split("|")[1], n]).sort((a, b) => b[1] - a[1]) }))
  .filter((c) => c.used.length > 1);

// ── 7. Écriture des propositions, jamais des fichiers définitifs.
const proposal = {
  _: "PROPOSITION générée par calibrate.mjs à partir du code existant. À relire, corriger, puis renommer en architecture.json. Les canImport reflètent ce que le dépôt fait AUJOURD'HUI — pas ce qu'il devrait faire : le gate part vert, on resserre ensuite d'un cran à la fois.",
  root: ROOT,
  aliases,
  layers: layers.map(({ _files, ...l }) => l),
  rules: {
    noCycles: mutual.length === 0,
    _noCycles: mutual.length ? `Mis à false : ${mutual.length} paire(s) de couches s'importent mutuellement. Le remettre à true dès que corrigé — c'est la dette la plus coûteuse du dépôt.` : undefined,
    noOrphans: false,
    entryPoints: [`${ROOT}/**/*.test.ts`, `${ROOT}/**/*.test.tsx`],
    unlayeredFilesAllowed: files.filter((f) => !layerOf(f)),
    maxDuplicationPercent: Number.isFinite(dupPercent) ? Math.max(1, Math.ceil(dupPercent * 10) / 10) : 3,
    duplicationWindow: 8,
    duplicationIgnore: [`${ROOT}/**/*.test.ts`, `${ROOT}/**/*.test.tsx`],
  },
};
writeFileSync(join(cwd, ".agent/project/architecture.proposed.json"), JSON.stringify(proposal, null, 2) + "\n", "utf8");

// ── Rapport. Ce que le script a mesuré, et ce qu'il laisse à décider.
const p = console.log;
p(`\nCALIBRAGE — ${files.length} fichiers sous « ${ROOT} », ${topDirs.length} couches candidates\n`);
p("Couches détectées et sens réel des imports :");
for (const l of layers) p(`  ${l.name.padEnd(14)} ${String(l._files).padStart(4)} fichiers   →  ${l.canImport.join(", ") || "(n'importe aucune autre couche)"}`);
if (proposal.rules.unlayeredFilesAllowed.length) p(`\n  ${proposal.rules.unlayeredFilesAllowed.length} fichier(s) à la racine de ${ROOT}/ — tolérés pour l'instant, listés dans la proposition.`);
if (mutual.length) { p("\n⚠ Couches qui s'importent MUTUELLEMENT — à trancher, c'est la dette la plus chère :"); for (const [a, b, x, y] of mutual) p(`  ${a} ⇄ ${b}   (${a}→${b} : ${x} imports · ${b}→${a} : ${y})`); }
if (Number.isFinite(dupPercent)) p(`\nDuplication actuelle : ${dupPercent} %  →  seuil proposé ${proposal.rules.maxDuplicationPercent} % (juste au-dessus : le gate part vert, puis on resserre).`);

if (conflicts.length) {
  p("\nVERBES EN CONFLIT — le dépôt dit déjà la même chose de deux façons. À trancher (le script compte, il ne choisit pas) :");
  for (const c of conflicts) p(`  ${c.fam.padEnd(8)} ${c.used.map(([v, n]) => `${v} ×${n}`).join("   ·   ")}`);
}
if (genericHits.size) { p("\nMOTS VIDES déjà présents :"); for (const [w, n] of [...genericHits.entries()].sort((a, b) => b[1] - a[1])) p(`  ${w} ×${n}`); }
const topNouns = [...nounHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
if (topNouns.length) p(`\nNOMS LES PLUS FRÉQUENTS (candidats au lexique — en garder 5 à 10, pas 50) :\n  ${topNouns.map(([w, n]) => `${w} ×${n}`).join("   ·   ")}`);

p(`
Écrit : .agent/project/architecture.proposed.json

À faire maintenant — ce sont des décisions, pas de l'exécution :
  1. Relire la proposition. Un canImport qui choque = une dette déjà présente, pas une erreur du script.
  2. La renommer en architecture.json.
  3. Écrire lexique.json à partir des conflits ci-dessus (le verbe le plus fréquent gagne, sauf raison contraire).
  4. npm run gate  — il doit être VERT au premier essai. S'il ne l'est pas, la proposition a été durcie à la main : c'est bien, mais ça se corrige maintenant.
`);
