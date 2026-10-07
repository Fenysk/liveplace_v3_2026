// Le thème du canvas en cours : enregistré quand le champ perd le focus, et montré à tous (Écart §8.1, JOURNAL 2026-10-07).

import { toTheme } from "@liveplace/domain";

// Le thème à enregistrer, nettoyé comme celui d'une archive (vide = plus de thème) ; `null` si rien ne change : pas d'appel.
export function toThemeToSave(draft: string, saved: string): string | null {
  const cleaned = toTheme(draft) ?? "";
  return cleaned === saved ? null : cleaned;
}

// Le thème que montre la page : celui de Convex, rendu avec elle, jusqu'à ce que le gateway ait répondu ; ensuite le sien,
// qui fait foi en direct : sans thème dans ses params, le canvas n'en a plus, même si la page en avait un.
export function toShownTheme(
  params: { theme?: string | undefined } | undefined,
  loaded: string | undefined,
): string | undefined {
  return params ? params.theme : loaded;
}
