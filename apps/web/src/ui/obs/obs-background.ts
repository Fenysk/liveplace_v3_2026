// Le fond de la vue OBS (CDC 2026 §1) : transparent, noir ou blanc. Ce que la vue peint sous les pixels.

import type { ObsBackground } from "@liveplace/domain";

// Les jetons de tokens.css : le vrai noir et le vrai blanc, jamais une couleur écrite ici.
const FILL_PROPERTIES: Record<Exclude<ObsBackground, "transparent">, string> = {
  black: "--obs-black",
  white: "--obs-white",
};

// `getProperty` lit une propriété CSS du document. Le transparent n'en lit aucune.
export const obsFillStyle = (background: ObsBackground, getProperty: (property: string) => string): string =>
  background === "transparent" ? "transparent" : getProperty(FILL_PROPERTIES[background]);
