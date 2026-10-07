// Les teintes d'une pastille de choix (Écart §15, JOURNAL 2026-10-06) : chacune est la classe `lp-swatch--<teinte>` de
// palette.css, jamais un `style`. La page d'archive est rendue par le serveur, et la CSP de production bloque l'attribut
// `style` du HTML qu'il écrit : la pastille perdrait sa couleur.

export const SWATCH_TONES = ["png-black", "png-white"] as const;

export type SwatchTone = (typeof SWATCH_TONES)[number];
