#!/usr/bin/env node
// LE GATE — l'unique condition d'arrêt.
//
// Toute la logique du socle tient dans une phrase : un agent ne sait pas s'il a fini,
// il sait seulement si le gate est vert. La littérature est nette là-dessus — quand la
// condition d'arrêt est un ensemble de vérifications exécutables, la boucle devient
// déterministe ; quand c'est une consigne en prose, elle dérive.
//
// Contrat de ce fichier :
//   - une seule commande, la même dans tous les projets : `npm run gate`
//   - ordre du moins cher au plus cher, arrêt à la première famille en échec
//   - sortie plafonnée : un dump de 500 lignes sature le contexte et masque l'info utile
//   - code de sortie 0 = vert, 1 = rouge. Rien d'autre ne compte.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = process.cwd();
const CORE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const baselineMode = args.includes("--baseline");

const pkg = existsSync(join(cwd, "package.json")) ? JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) : {};
// Gestionnaire de paquets : détecté, jamais supposé. Une commande écrite dans les règles
// mais impossible à lancer telle quelle est pire qu'une règle absente — l'agent, ne
// pouvant pas l'exécuter, se rabat sur « à toi de lancer ».
const PM = existsSync(join(cwd, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(cwd, "yarn.lock")) ? "yarn" : existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock")) ? "bun" : "npm";
const RUN = PM === "npm" ? "npm run --silent" : PM === "bun" ? "bun run" : `${PM} run --silent`;
const EXEC = PM === "npm" ? "npx --no-install" : PM === "bun" ? "bunx" : `${PM} exec`;
const scripts = pkg.scripts ?? {};
const has = (name) => typeof scripts[name] === "string";
const override = existsSync(join(cwd, ".agent/project/gate.json")) ? JSON.parse(readFileSync(join(cwd, ".agent/project/gate.json"), "utf8")) : {};

// Détection : on préfère toujours le script du projet s'il existe (il connaît la config
// du monorepo mieux que nous). `null` = étape absente → ignorée, jamais silencieusement verte.
const detect = () => {
  const steps = [];
  const typecheck = override.typecheck ?? (has("typecheck") ? `${RUN} typecheck` : existsSync(join(cwd, "tsconfig.json")) ? `${EXEC} tsc --noEmit` : null);
  const lint = override.lint ?? (has("check") ? `${RUN} check` : has("lint") ? `${RUN} lint` : null);
  const test = override.test ?? (has("test") ? `${RUN} test` : null);

  // Le projet a souvent DÉJÀ sa commande de vérification. Si le gate ne la lance pas,
  // il existe deux vérités concurrentes — et l'agent finit par suivre la mauvaise, ou
  // par déléguer. Le gate doit être un SUR-ensemble de ce que le projet vérifie déjà.
  const ownVerify = ["verify", "validate", "ci"].find((n) => has(n) && !/gate\.mjs/.test(scripts[n]));

  if (typecheck) steps.push({ name: "types", cmd: typecheck, head: 25, why: "94 % des erreurs de compilation produites par un LLM sont des erreurs de types, pas de syntaxe. C'est le filet le plus rentable du socle." });
  if (lint) steps.push({ name: "lint", cmd: lint, head: 25 });
  steps.push({ name: "core-integrity", cmd: `node "${join(CORE, "checks/core-integrity.mjs")}"`, head: 12 });
  steps.push({ name: "architecture", cmd: `node "${join(CORE, "checks/architecture.mjs")}"`, head: 40 });
  steps.push({ name: "lexique", cmd: `node "${join(CORE, "checks/lexique.mjs")}"`, head: 40 });
  steps.push({ name: "duplication", cmd: `node "${join(CORE, "checks/duplication.mjs")}"`, head: 40 });
  steps.push({ name: "test-integrity", cmd: `node "${join(CORE, "checks/test-integrity.mjs")}"`, head: 20 });
  for (const extra of override.extra ?? []) steps.push({ name: extra.name, cmd: extra.cmd, head: extra.head ?? 30 });
  if (test) steps.push({ name: "tests", cmd: test, head: 40 });
  if (ownVerify) steps.push({ name: ownVerify, cmd: `${RUN} ${ownVerify}`, head: 30, why: `Script de vérification propre au projet. Le gate le lance pour qu'il n'existe qu'UNE commande faisant autorité.` });
  return steps;
};

const steps = detect().filter((s) => !only || s.name === only);
if (steps.length === 0) {
  console.error(`GATE: FAIL — aucune étape « ${only} ».`);
  process.exit(1);
}

const truncate = (out, head) => {
  const lines = out.split("\n").filter((l) => l.trim());
  if (lines.length <= head) return lines.join("\n");
  return lines.slice(0, head).join("\n") + `\n… (${lines.length - head} lignes coupées — corriger celles-ci d'abord, elles causent souvent les suivantes)`;
};

// --baseline : fige les violations existantes pour n'échouer que sur les NOUVELLES.
// Réservé à l'adoption sur un dépôt existant, et à relancer pour faire DESCENDRE
// le compteur — jamais pour faire taire une violation qu'on vient d'introduire.
if (baselineMode) {
  const suppressed = {};
  for (const step of steps.filter((s) => s.cmd.includes("checks/"))) {
    const r = spawnSync(step.cmd, { cwd, shell: true, encoding: "utf8", env: { ...process.env, SOCLE_BASELINE: "1" }, maxBuffer: 32 * 1024 * 1024 });
    for (const line of `${r.stdout ?? ""}`.split("\n")) {
      if (!line.startsWith("SOCLE_BASELINE_JSON ")) continue;
      const { check, tally } = JSON.parse(line.slice(20));
      if (Object.keys(tally).length) suppressed[check] = tally;
    }
  }
  const total = Object.values(suppressed).flatMap((t) => Object.values(t)).reduce((a, b) => a + b, 0);
  const path = join(cwd, ".agent/project/baseline.json");
  writeFileSync(path, JSON.stringify({
    _: "DETTE CONNUE, gelée au moment de l'adoption du socle. Ces violations sont tolérées ; toute NOUVELLE violation fait échouer le gate. Ce compteur ne doit que descendre : après avoir corrigé, relancer `npm run gate -- --baseline`. Ne JAMAIS le régénérer pour faire taire une violation qu'on vient d'introduire — ce serait rendre le gate inutile en une commande.",
    generatedAt: new Date().toISOString().slice(0, 10),
    total,
    suppressed,
  }, null, 2) + "\n", "utf8");
  console.log(`Baseline écrite : .agent/project/baseline.json — ${total} violation(s) héritée(s) gelée(s).`);
  console.log("Le gate n'échouera plus que sur les NOUVELLES. Relancer cette commande après chaque lot corrigé");
  console.log("pour faire descendre le compteur — c'est le cliquet.");
  process.exit(0);
}

const failed = [];
for (const step of steps) {
  const started = Date.now();
  const r = spawnSync(step.cmd, { cwd, shell: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const ms = Date.now() - started;
  if (r.status === 0) {
    // La dette connue doit rester VISIBLE à chaque passage : une dette qu'on ne voit
    // plus est une dette qu'on ne rembourse jamais.
    const lines = out.split("\n").filter((l) => l.trim());
    const debt = lines.find((l) => l.includes("dette connue"))?.match(/\(dette connue[^)]*\)/)?.[0] ?? "";
    const tail = lines.slice(-1)[0] ?? "";
    const extra = debt || (tail.startsWith("✔") ? "" : tail.slice(0, 80));
    console.log(`✔ ${step.name.padEnd(13)} ${String(ms).padStart(6)} ms  ${extra}`);
    continue;
  }
  failed.push(step.name);
  console.log(`\n─ ${step.name} — échec en ${ms} ms`);
  if (step.why) console.log(`  ${step.why}`);
  console.log(truncate(out, step.head).replace(/^/gm, "  "));
  // Arrêt à la première famille en échec : corriger les types avant de lire un
  // rapport d'architecture calculé sur du code qui ne compile pas est du bruit.
  if (["types", "lint"].includes(step.name)) break;
}

console.log("");
if (failed.length === 0) {
  console.log("GATE: PASS — le changement peut être annoncé terminé.");
  process.exit(0);
}
console.log(`GATE: FAIL — ${failed.join(", ")}`);
console.log("Le travail n'est PAS terminé. Ne pas l'annoncer comme tel, ne pas commiter.");
console.log("Interdit : désactiver une règle, élargir un seuil, ajouter `any` / `@ts-ignore` / `eslint-disable`");
console.log("pour faire passer le gate. Faire passer le gate en l'affaiblissant, c'est supprimer le seul");
console.log("mécanisme qui vous dit que le dépôt dérive. Corriger le code, ou décider — et une décision");
console.log("s'écrit dans .agent/project/JOURNAL.md avant de toucher aux données du socle.");
process.exit(1);
