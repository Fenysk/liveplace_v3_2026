#!/usr/bin/env node
// CHECK 3 — Duplication. GitClear mesure sur 623 M de changements que la duplication
// de blocs a bondi de +81 % depuis 2023, pendant que le refactoring tombait de 21 %
// à 3,8 % des lignes modifiées. Un agent ne refactore pas spontanément : il recopie.
// Ce check est le contrepoids. Il ne juge pas le style — il compte.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { walk, stripNoise, globToRegExp, loadJson, toPosix, report } from "../lib/scan.mjs";

const cwd = process.cwd();
const arch = loadJson(join(cwd, ".agent/project/architecture.json"));
const cfg = arch?.rules ?? {};
const WINDOW = cfg.duplicationWindow ?? 8;       // lignes significatives consécutives (jscpd en utilise 5 : 8 reste conservateur)
const MAX_PERCENT = cfg.maxDuplicationPercent ?? 3;
const ignoreRes = (cfg.duplicationIgnore ?? []).map(globToRegExp);

// Lignes purement structurelles : les compter ferait exploser les faux positifs
// (toute suite de `}` se ressemble). On ne compare que du code porteur de sens.
const isNoise = (l) => l.length < 4 || /^[)\]}\s;,]+$/.test(l) || /^(import|export)\b/.test(l) || /^(\}|\)|\]|<\/)/.test(l);

const windows = new Map();
let significantLines = 0;

for (const abs of walk(join(cwd, arch?.root ?? "src"))) {
  const file = toPosix(abs.slice(cwd.length + 1));
  if (ignoreRes.some((re) => re.test(file))) continue;
  const lines = stripNoise(readFileSync(abs, "utf8")).split("\n");
  const kept = [];
  lines.forEach((l, i) => {
    const t = l.trim().replace(/\s+/g, " ");
    if (!isNoise(t)) kept.push({ t, line: i + 1 });
  });
  significantLines += kept.length;
  for (let i = 0; i + WINDOW <= kept.length; i++) {
    const slice = kept.slice(i, i + WINDOW);
    const h = createHash("sha1").update(slice.map((s) => s.t).join("\n")).digest("hex");
    if (!windows.has(h)) windows.set(h, []);
    windows.get(h).push({ file, line: slice[0].line });
  }
}

const violations = [];
let duplicatedLines = 0;
const claimed = new Map(); // évite de signaler 10 fenêtres glissantes pour un seul bloc copié

for (const hits of windows.values()) {
  if (hits.length < 2) continue;
  const fresh = hits.filter((h) => {
    const last = claimed.get(h.file) ?? -Infinity;
    return h.line > last;
  });
  if (fresh.length < 2) continue;
  for (const h of fresh) claimed.set(h.file, h.line + WINDOW);
  duplicatedLines += WINDOW * (fresh.length - 1);
  violations.push(`${WINDOW} lignes identiques × ${fresh.length} : ${fresh.map((h) => `${h.file}:${h.line}`).join("  ↔  ")}`);
}

const percent = significantLines ? (duplicatedLines / significantLines) * 100 : 0;
console.log(`  duplication : ${percent.toFixed(2)} % (seuil ${MAX_PERCENT} %) sur ${significantLines} lignes significatives`);

if (percent <= MAX_PERCENT) {
  process.exit(report("duplication", []));
}
process.exit(
  report("duplication", violations, {
    limit: 8,
    hint: "Avant d'extraire : la règle de trois. Deux occurrences qui encodent DEUX décisions indépendantes doivent rester séparées — DRY porte sur la connaissance, pas sur le texte. Si les deux occurrences changent toujours ensemble, extraire. Sinon, relever le seuil dans architecture.json et écrire pourquoi dans JOURNAL.md.",
  })
);
