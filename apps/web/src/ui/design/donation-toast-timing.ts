// Le toast d'un don (mode événement) : ce qu'il affiche et combien de temps il reste. Des fonctions pures, sans React.

import { pixelsOfCents } from "@liveplace/domain/charity-event";
import { INTL_TAGS, type Locale } from "../locale/locale";

// Le texte défile à vitesse constante, et ne démarre qu'après un court temps de lecture.
export const SCROLL_PX_PER_S = 55;
export const SCROLL_DELAY_MS = 600;

const MIN_DISPLAY_MS = 8000;
// Le texte passe au moins deux fois en entier avant que le toast parte.
const FULL_PASSES = 2;

// Un tour de défilement : la largeur d'une copie du texte, à la vitesse du défilement.
export const cycleMsOf = (copyWidthPx: number): number => Math.round((copyWidthPx / SCROLL_PX_PER_S) * 1000);

// `cycleMs` nul : pas de défilement (mouvement réduit) ou pas encore mesuré, le texte est lu tel quel.
export const donationDurationMs = (cycleMs: number | null): number =>
  cycleMs === null ? MIN_DISPLAY_MS : Math.max(MIN_DISPLAY_MS, SCROLL_DELAY_MS + FULL_PASSES * cycleMs);

// 1 € = 10 pixels, arrondi vers le bas : la règle du domaine, pour une frame qui n'a pas de `pixels`.
export const pixelsOf = (amountCents: number): number => pixelsOfCents(amountCents);

// « 5 € », « 12,50 € » : les décimales seulement quand le montant n'est pas rond.
// `currency` : le code de la devise du don ; un code que la langue ne connaît pas s'écrit tel quel après le nombre.
export const formatAmount = (amountCents: number, locale: Locale, currency = "EUR"): string => {
  const digits = amountCents % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(INTL_TAGS[locale], {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(digits)} ${currency}`;
  }
};

export const formatPixels = (pixels: number, locale: Locale): string =>
  new Intl.NumberFormat(INTL_TAGS[locale]).format(pixels);
