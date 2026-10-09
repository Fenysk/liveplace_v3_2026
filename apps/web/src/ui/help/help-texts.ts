// Les mots des bulles d'aide (Écart §8.1, JOURNAL 2026-10-08), validés tels quels, chacun en français et en anglais (Écart §14,
// JOURNAL 2026-10-07). Les chiffres de la jauge viennent du canvas.

import type { Refill } from "../../state/gauge";
import type { Locale } from "../locale/locale";
import { defineTexts, type Localized, localized } from "../locale/texts";

const MS_PER_SECOND = 1000;

type Unit = "h" | "min" | "s";

// Du plus grand au plus petit : l'intervalle se dit en ses unités non nulles, ou par le nom de l'unité s'il en vaut exactement une.
const UNITS: readonly { seconds: number; short: Unit }[] = [
  { seconds: 3600, short: "h" },
  { seconds: 60, short: "min" },
  { seconds: 1, short: "s" },
];

type Every = { prefix: string; exactly: Record<Unit, string> };

const EVERY: Localized<Every> = {
  fr: {
    prefix: "toutes les ",
    exactly: { h: "toutes les heures", min: "toutes les minutes", s: "toutes les secondes" },
  },
  en: { prefix: "every ", exactly: { h: "every hour", min: "every minute", s: "every second" } },
};

// L'intervalle d'une recharge, dit comme on le lit : « toutes les 10 s », « toutes les minutes », « toutes les 1 min 30 s ».
export function everyText(ms: number, locale: Locale): string {
  const { prefix, exactly } = EVERY[locale];
  if (ms < MS_PER_SECOND) return `${prefix}${ms} ms`;
  let rest = Math.round(ms / MS_PER_SECOND);
  const parts: string[] = [];
  for (const { seconds, short } of UNITS) {
    const count = Math.floor(rest / seconds);
    rest -= count * seconds;
    if (count === 1 && rest === 0 && parts.length === 0) return exactly[short];
    if (count > 0) parts.push(`${count} ${short}`);
  }
  return `${prefix}${parts.join(" ")}`;
}

// Un pixel, ou plusieurs quand la recharge en rend plusieurs d'un coup.
const PIXELS: Localized<(count: number) => string> = {
  fr: (count) => (count === 1 ? "un pixel" : `${count} pixels`),
  en: (count) => (count === 1 ? "one pixel" : `${count} pixels`),
};

export const HELP_TEXTS = defineTexts({
  report: { fr: "Un pixel a été signalé", en: "A pixel was reported" },
  obs: { fr: "Ajoute ton canvas à OBS ici", en: "Add your canvas to OBS here" },
  // La suite de la chaîne OBS, dans la fenêtre (Écart §8.1, JOURNAL 2026-10-09) : l'onglet, puis l'adresse.
  obsTab: { fr: "Ton adresse OBS est dans cet onglet", en: "Your OBS address is in this tab" },
  obsAddress: {
    fr: "Copie cette adresse, colle-la dans OBS",
    en: "Copy this address and paste it into OBS",
  },
  reward: {
    fr: "Une récompense t'attend : +1 sur ta jauge max",
    en: "A reward is waiting for you: +1 on your max gauge",
  },
  trace: { fr: "Active le tracé pour dessiner en glissant", en: "Turn on Trace to draw by dragging" },

  // Au doigt on touche, à la souris on clique : la bulle du premier passage en Dessin dit celui des deux qui sert.
  draft: localized({
    fr: (isTouchScreen: boolean) =>
      `${isTouchScreen ? "Touche le canvas" : "Clique sur le canvas"} pour préparer ton dessin, Valider l'envoie`,
    en: (isTouchScreen) =>
      `${isTouchScreen ? "Tap the canvas" : "Click the canvas"} to prepare your drawing, then Confirm to send it`,
  }),

  // Avant le `welcome`, le canvas n'a pas ses chiffres : la bulle ne les invente pas.
  gauge: localized({
    fr: (refill: Refill | undefined) =>
      refill
        ? `Ta jauge se recharge toute seule : ${PIXELS.fr(refill.refillCharges)} ${everyText(refill.refillMs, "fr")}`
        : "Ta jauge se recharge toute seule",
    en: (refill) =>
      refill
        ? `Your gauge refills on its own: ${PIXELS.en(refill.refillCharges)} ${everyText(refill.refillMs, "en")}`
        : "Your gauge refills on its own",
  }),
});
