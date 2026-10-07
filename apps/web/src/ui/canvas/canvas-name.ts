// Le nom du canvas en cours, enregistré quand le champ perd le focus (Écart §15, JOURNAL 2026-10-06).

import { toArchiveName } from "@liveplace/domain";

// Le nom à enregistrer, nettoyé comme celui d'une archive (vide = plus de nom) ; `null` si rien ne change : pas d'appel.
export function toNameToSave(draft: string, saved: string): string | null {
  const cleaned = toArchiveName(draft) ?? "";
  return cleaned === saved ? null : cleaned;
}
