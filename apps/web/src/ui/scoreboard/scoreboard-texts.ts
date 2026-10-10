// Les mots du classement (JOURNAL 2026-10-06) : le rang à la française, jamais de « # », et les pixels au pluriel.
// Écart §14 (JOURNAL 2026-10-07) : et à l'anglaise, « 1st, 2nd, 3rd ».

import type { ScoreboardRow } from "../../state/scoreboard";
import { formatNumber, INTL_TAGS, type Locale } from "../locale/locale";
import { defineTexts } from "../locale/texts";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";

export const SCOREBOARD_TEXTS = defineTexts({
  label: { fr: "Classement", en: "Scoreboard" },
  collapse: { fr: "Replier le classement", en: "Collapse the scoreboard" },
  expand: { fr: "Déplier le classement", en: "Expand the scoreboard" },
  // Le suffixe d'un rang selon la règle des ordinaux de la langue (`Intl.PluralRules`, type ordinal).
  ordinalSuffixes: {
    fr: { zero: "e", one: "er", two: "e", few: "e", many: "e", other: "e" },
    en: { zero: "th", one: "st", two: "nd", few: "rd", many: "th", other: "th" },
  },
});

// À l'écran, le suffixe se met en exposant ; pour un lecteur d'écran, il reste collé au nombre.
export const ordinalSuffix = (rank: number, locale: Locale): string =>
  SCOREBOARD_TEXTS[locale].ordinalSuffixes[
    new Intl.PluralRules(INTL_TAGS[locale], { type: "ordinal" }).select(rank)
  ];

// Déplié, le nombre seul : le mot « pixels » chargerait la ligne, et le nom accessible le dit.
export const pixelsNumber = (pixels: number, locale: Locale): string => formatNumber(pixels, locale);

export const rankText = (rank: number, locale: Locale): string => `${rank}${ordinalSuffix(rank, locale)}`;

// Le nom d'une ligne : tout ce que l'écran montre au survol, dit d'un trait.
export const rowLabel = ({ rank, pixels, player }: ScoreboardRow, locale: Locale): string =>
  `${rankText(rank, locale)}, ${player.displayName}, ${MODERATION_TEXTS[locale].pixelCount(pixels)}`;

// La pastille d'un rang tient dans un petit rond : au-delà de 99, elle ne dit plus que « 99+ ».
export const badgeRank = (rank: number): string => (rank > 99 ? "99+" : String(rank));
