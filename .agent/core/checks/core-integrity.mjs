#!/usr/bin/env node
// CHECK 5 — Intégrité du noyau.
//
// Constaté sur le terrain : face à une limite du socle, un agent corrige le socle
// lui-même — dans `.agent/core/`, qui est écrasé à la prochaine installation. Son
// correctif est donc condamné, et personne ne s'en apercevra avant que le bug revienne.
//
// C'est la pire forme d'échec : silencieuse, différée, et elle punit exactement le bon
// réflexe (avoir vu un vrai manque). Ce check rend la modification visible et dit quoi
// en faire — la remonter en amont, là où elle survivra.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { report } from "../lib/scan.mjs";

const cwd = process.cwd();
const CORE = join(cwd, ".agent/core");
const MANIFEST = join(CORE, "MANIFEST");

if (!existsSync(MANIFEST)) {
  console.log("• core-integrity — pas de MANIFEST (socle installé avant cette version) : relancer install.mjs pour l'activer");
  process.exit(0);
}

const expected = new Map(
  readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean).map((l) => {
    const [hash, ...rest] = l.split("  ");
    return [rest.join("  "), hash];
  })
);

// Marche complète : le noyau contient aussi des .json, .jsonc et VERSION. Un walk qui
// filtre par extension les déclarerait « supprimés » — un faux positif, et un check en
// qui on n'a pas confiance est un check qu'on désactive.
const sha = (p) => createHash("sha1").update(readFileSync(p)).digest("hex");
const actual = new Map();
const walkAll = (dir) => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) { if (e !== "skills") walkAll(f); continue; }
    if (e === "MANIFEST") continue;
    actual.set(relative(CORE, f).split("\\").join("/"), sha(f));
  }
};
walkAll(CORE);

const violations = [];
for (const [rel, hash] of expected) {
  if (!actual.has(rel)) violations.push(`.agent/core/${rel} — supprimé du noyau.`);
  else if (actual.get(rel) !== hash) violations.push(`.agent/core/${rel} — modifié à la main. Ce dossier est écrasé à la prochaine installation : ce correctif sera perdu en silence.`);
}
for (const rel of actual.keys()) if (!expected.has(rel)) violations.push(`.agent/core/${rel} — ajouté au noyau. Même problème : il disparaîtra.`);

process.exit(
  report("core-integrity", violations, {
    limit: 10,
    hint: "Si le noyau manque vraiment de quelque chose, c'est une bonne nouvelle — mais ça se corrige EN AMONT, dans le dépôt du socle, pas dans la copie vendorée. En attendant, un check maison propre à ce projet va dans .agent/project/ et se branche via gate.json : celui-là survit aux mises à jour.",
  })
);
