// Utilitaires partagés par les checks. Zéro dépendance : le socle doit tourner
// dans n'importe quel dépôt, sur n'importe quelle machine, sans `npm install`.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, extname, posix } from "node:path";

export const CODE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", ".next", ".output", "coverage", ".turbo", ".vercel", ".agent"]);

/** Chemins POSIX partout : une règle qui matche sous Linux doit matcher sous Windows. */
export const toPosix = (p) => p.split("\\").join("/");

export function walk(root, files = []) {
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (CODE_EXT.has(extname(entry))) files.push(full);
  }
  return files;
}

/**
 * Retire commentaires et littéraux de chaîne AVANT toute analyse.
 * Sans ça, un check de nomenclature signale des mots trouvés dans les commentaires
 * ou dans du texte d'interface — des faux positifs qui font perdre confiance au gate,
 * et un gate en qui on n'a pas confiance est un gate qu'on désactive.
 */
export function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

export function extractImports(src) {
  const out = [];
  for (const re of [IMPORT_RE, BARE_IMPORT_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

/** Résout un spécifieur vers un chemin de fichier du dépôt, ou null si externe. */
export function resolveSpecifier(spec, fromFile, cwd, aliases) {
  let base = null;
  if (spec.startsWith(".")) {
    base = resolve(dirname(fromFile), spec);
  } else {
    for (const [prefix, target] of Object.entries(aliases)) {
      const clean = prefix.replace(/\*$/, "");
      if (spec.startsWith(clean)) {
        base = resolve(cwd, target.replace(/\*$/, "") + spec.slice(clean.length));
        break;
      }
    }
  }
  if (!base) return null; // paquet externe : hors périmètre des règles de couches
  const candidates = [base, ...[".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"].flatMap((e) => [base + e, join(base, "index" + e)])];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return toPosix(relative(cwd, c));
  }
  return null; // fichier non résolu (type-only, asset…) : tsc le signalera, pas nous
}

/**
 * Glob minimal, suffisant pour des chemins de couches :
 *   `**/` traverse zéro ou plusieurs dossiers, `/**` en fin capte tout le sous-arbre,
 *   `*` s'arrête au séparateur.
 * Écrit à la main plutôt qu'importé : le socle doit tourner sans `npm install`.
 */
export function globToRegExp(glob) {
  const DEEP_DIR = "\u0000"; // **/  → (?:.*/)?
  const DEEP_ANY = "\u0001"; // **   → .*
  let g = toPosix(glob)
    .replace(/\*\*\//g, DEEP_DIR)
    .replace(/\/\*\*$/g, "/" + DEEP_ANY)
    .replace(/\*\*/g, DEEP_ANY);
  g = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  g = g.split(DEEP_DIR).join("(?:.*/)?").split(DEEP_ANY).join(".*");
  return new RegExp("^" + g + "$");
}

/** Échec net et lisible. Une trace de pile Node n'apprend rien à un agent. */
export function fail(message) {
  console.log(`✘ ${message}`);
  process.exit(1);
}

export function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${toPosix(path)} — JSON invalide : ${e.message}\n  Le gate ne peut pas vérifier ce qu'il ne peut pas lire. Corriger le fichier.`);
  }
}

/**
 * DETTE CONNUE. Sans ça, le socle est inadoptable sur un dépôt existant : le premier
 * gate remonte 300 violations héritées, on n'a pas le temps de les traiter, et on
 * désactive tout. Une seule fois suffit à perdre le mécanisme pour toujours.
 *
 * La baseline gèle les violations DÉJÀ présentes et ne laisse passer que les NOUVELLES.
 * La clé ignore les numéros de ligne (le code bouge) mais compte les occurrences : une
 * de plus dans le même fichier est signalée. C'est un cliquet — le compteur ne peut que
 * descendre, et le gate affiche la dette restante à chaque passage pour qu'elle reste visible.
 */
const keyOf = (text) => String(text).replace(/:\d+/g, "").replace(/\s+/g, " ").trim();

export function loadBaseline(cwd) {
  const b = loadJson(join(cwd, ".agent/project/baseline.json"));
  return b?.suppressed ?? {};
}

export function splitKnown(checkName, violations, baseline) {
  const allowed = { ...(baseline[checkName] ?? {}) };
  const fresh = [], known = [];
  for (const v of violations) {
    const k = keyOf(v);
    if (allowed[k] > 0) { allowed[k] -= 1; known.push(v); } else fresh.push(v);
  }
  return { fresh, known };
}

export function tally(violations) {
  const out = {};
  for (const v of violations) { const k = keyOf(v); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/**
 * Sortie pensée pour un agent, pas pour un humain qui scrolle.
 * Un dump de 500 lignes sature la fenêtre de contexte et noie l'information utile :
 * on plafonne, on groupe, et on dit toujours quoi faire.
 */
export function report(checkName, violations, { limit = 15, hint, cwd = process.cwd() } = {}) {
  // Mode collecte : le gate demande l'inventaire complet pour écrire la baseline.
  if (process.env.SOCLE_BASELINE === "1") {
    console.log("SOCLE_BASELINE_JSON " + JSON.stringify({ check: checkName, tally: tally(violations) }));
    return 0;
  }
  const { fresh, known } = splitKnown(checkName, violations, loadBaseline(cwd));
  const debt = known.length ? `  (dette connue : ${known.length} tolérée${known.length > 1 ? "s" : ""})` : "";
  if (fresh.length === 0) {
    console.log(`✔ ${checkName}${debt}`);
    return 0;
  }
  console.log(`✘ ${checkName} — ${fresh.length} violation(s)${debt}`);
  for (const v of fresh.slice(0, limit)) console.log(`  ${v}`);
  if (fresh.length > limit) console.log(`  … et ${fresh.length - limit} de plus (même nature)`);
  if (hint) console.log(`  → ${hint}`);
  return 1;
}
