#!/usr/bin/env node
// CHECK 4 — Intégrité des tests.
//
// Pourquoi ce check existe : le TDD marche mesurablement mieux sur un agent que sur un
// humain (+12 % à +29,6 % de réussite selon le modèle), parce qu'un test rouge est une
// condition d'arrêt et qu'un agent, contrairement à un humain, ne sait pas quand il a fini.
//
// Mais le mode d'échec est brutal et documenté : mis face à un test qu'il n'arrive pas à
// faire passer, un agent déplace la cible. ImpossibleBench mesure jusqu'à 76 % de triche
// selon le modèle, et note que les modèles Anthropic trichent surtout « en modifiant
// directement les fichiers de test ». La consigne en prose ne suffit pas : elle fait
// tomber la triche de 93 % à 1 % sur un benchmark, et seulement de 66 % à 54 % sur un autre.
// Ce qui marche vraiment, mesuré : rendre les tests inaccessibles en écriture.
//
// À défaut de pouvoir verrouiller le système de fichiers, on rend la triche VISIBLE :
// un test ne peut que gagner des assertions, jamais en perdre. Et `.skip` / `.only`
// ne franchissent jamais un commit.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadJson, report } from "../lib/scan.mjs";

const cwd = process.cwd();
const arch = loadJson(join(cwd, ".agent/project/architecture.json"));
const TEST_GLOB = arch?.rules?.testFilePattern ?? "\\.(test|spec)\\.[cm]?[jt]sx?$";
const testRe = new RegExp(TEST_GLOB);

const git = (cmd) => execSync(`git ${cmd}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
try {
  git("rev-parse HEAD");
} catch {
  console.log("• test-integrity — pas d'historique git (ou pas un dépôt) : rien à comparer, check inapplicable");
  process.exit(0);
}

// Compter, pas interpréter. Une assertion en moins est un signal, quelle que soit la raison.
const countAssertions = (src) => (src.match(/\b(?:expect|assert)\s*[(.]/g) ?? []).length;
const countCases = (src) => (src.match(/\b(?:it|test)\s*(?:\.\w+)?\s*\(/g) ?? []).length;

const violations = [];
const changed = git("diff --name-only HEAD").split("\n").filter(Boolean);
const deleted = git("diff --name-only --diff-filter=D HEAD").split("\n").filter(Boolean);

for (const file of changed.filter((f) => testRe.test(f))) {
  if (deleted.includes(file)) {
    violations.push(`${file} — fichier de test SUPPRIMÉ. Un test qu'on efface n'a pas été satisfait, il a été évité.`);
    continue;
  }
  let before;
  try {
    before = git(`show HEAD:${file}`);
  } catch {
    continue; // nouveau fichier de test : rien à comparer, et en ajouter est toujours bon
  }
  const after = readFileSync(join(cwd, file), "utf8");
  const [aBefore, aAfter] = [countAssertions(before), countAssertions(after)];
  const [cBefore, cAfter] = [countCases(before), countCases(after)];
  if (aAfter < aBefore) violations.push(`${file} — ${aBefore - aAfter} assertion(s) en MOINS (${aBefore} → ${aAfter}). Le test n'a pas été satisfait, il a été affaibli.`);
  if (cAfter < cBefore) violations.push(`${file} — ${cBefore - cAfter} cas de test en MOINS (${cBefore} → ${cAfter}).`);
}

// `.only` est le plus vicieux : il ne fait échouer personne, il fait juste taire tous les
// autres tests. Un dépôt peut vivre des mois avec 3 tests exécutés sur 400 sans le savoir.
for (const file of changed.filter((f) => testRe.test(f))) {
  if (deleted.includes(file) || !existsSync(join(cwd, file))) continue;
  const src = readFileSync(join(cwd, file), "utf8");
  for (const [re, why] of [
    [/\b(?:it|test|describe)\s*\.\s*only\s*\(/g, "`.only` — désactive TOUS les autres tests en silence"],
    [/\b(?:it|test|describe)\s*\.\s*skip\s*\(/g, "`.skip` — test désactivé"],
    [/\b(?:xit|xtest|xdescribe)\s*\(/g, "`x`-prefix — test désactivé"],
    [/@ts-(?:ignore|expect-error)/g, "`@ts-ignore` dans un test — le test ne prouve plus le type"],
  ]) {
    const n = (src.match(re) ?? []).length;
    if (n) violations.push(`${file} — ${n}× ${why}.`);
  }
}

process.exit(
  report("test-integrity", violations, {
    hint: "Un test rouge se satisfait en changeant le CODE. Le modifier, c'est déplacer la cible — le geste exact que les benchmarks de triche mesurent. Si le test était réellement faux, le corriger est une décision : elle s'écrit dans JOURNAL.md, et la baseline la gèle explicitement.",
  })
);
