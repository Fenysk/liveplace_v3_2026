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

// Ce que rend une recharge : « 1 pixel » ou « 3 pixels », le nombre en chiffres dans les deux langues.
const pixelsText = (count: number): string => `${count} ${count === 1 ? "pixel" : "pixels"}`;

export const HELP_TEXTS = defineTexts({
  report: { fr: "Un dessin a été signalé", en: "A drawing was reported" },
  obs: { fr: "Ajoute ta fresque à OBS ici", en: "Add your canvas to OBS here" },
  // La suite de la chaîne OBS, dans la fenêtre (Écart §8.1, JOURNAL 2026-10-09) : l'onglet, puis l'adresse.
  obsTab: { fr: "Ton adresse OBS est dans cet onglet", en: "Your OBS address is in this tab" },
  obsAddress: {
    fr: "Copie cette adresse, colle-la dans OBS",
    en: "Copy this address and paste it into OBS",
  },
  // La suite de la chaîne du streamer (Écart §8.1, JOURNAL 2026-10-12) : le lien à partager, sur le bouton de l'adresse OBS déjà
  // copiée ; le thème ; la synchro Twitch.
  inviteLink: { fr: "Partage aussi ce lien à tes viewers", en: "Share this link with your viewers too" },
  theme: { fr: "Donne un thème à ta fresque", en: "Give your canvas a theme" },
  twitchSync: { fr: "Reprends tes modérateurs Twitch ici", en: "Import your Twitch moderators here" },
  reward: {
    fr: "Une récompense t'attend : +1 sur ta jauge max",
    en: "A reward is waiting for you: +1 on your max gauge",
  },
  trace: { fr: "Active le tracé pour dessiner en glissant", en: "Turn on Trace to draw by dragging" },

  // Pour qui modère (Écart §8.1, JOURNAL 2026-10-12) : sa pill Modération, puis les actions de l'inspection.
  moderatorWelcome: {
    fr: "Tu modères cette fresque : tout est ici",
    en: "You moderate this canvas: everything is here",
  },
  moderationActions: {
    fr: "Retire ses pixels ou bannis ce viewer ici",
    en: "Clear their pixels or ban this viewer here",
  },

  // Ce qui reste à apprendre en Dessin, une fois des dessins posés (Écart §8.1, JOURNAL 2026-10-12) : la palette au doigt, les
  // Ctrl+Z à la souris (une ligne), la pipette.
  palette: { fr: "Touche ta couleur pour ouvrir la palette", en: "Tap your color to open the palette" },
  keys: { fr: "Ctrl+Z : annule ton dernier trait", en: "Ctrl+Z: undo your last stroke" },
  eyedropper: {
    fr: "La pipette reprend une couleur de la fresque",
    en: "The eyedropper picks up a color from the canvas",
  },

  // Au doigt on touche, à la souris on clique : la bulle du premier passage en Dessin dit celui des deux qui sert.
  draft: localized({
    fr: (isTouchScreen: boolean) =>
      `${isTouchScreen ? "Touche la fresque" : "Clique sur la fresque"} pour préparer ton dessin, Valider l'envoie`,
    en: (isTouchScreen) =>
      `${isTouchScreen ? "Tap the canvas" : "Click the canvas"} to prepare your drawing, then Confirm to send it`,
  }),

  // Avant le `welcome`, le canvas n'a pas ses chiffres : la bulle ne les invente pas.
  gauge: localized({
    fr: (refill: Refill | undefined) =>
      refill
        ? `Ta jauge se recharge toute seule : ${pixelsText(refill.refillCharges)} ${everyText(refill.refillMs, "fr")}`
        : "Ta jauge se recharge toute seule",
    en: (refill) =>
      refill
        ? `Your gauge refills on its own: ${pixelsText(refill.refillCharges)} ${everyText(refill.refillMs, "en")}`
        : "Your gauge refills on its own",
  }),
});
