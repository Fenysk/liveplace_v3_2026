// Les mots des bulles d'aide (Écart §8.1, JOURNAL 2026-10-08), validés tels quels. Les chiffres de la jauge viennent du canvas.

import type { Refill } from "../../state/gauge";

export const REPORT_TEXT = "Un pixel a été signalé";
export const OBS_TEXT = "Ajoute ton canvas à OBS ici";
// La suite de la chaîne OBS, dans la fenêtre (Écart §8.1, JOURNAL 2026-10-09) : l'onglet, puis l'adresse.
export const OBS_TAB_TEXT = "Ton adresse OBS est dans cet onglet";
export const OBS_ADDRESS_TEXT = "Copie cette adresse, colle-la dans OBS";
export const REWARD_TEXT = "Une récompense t'attend : +1 sur ta jauge max";
export const TRACE_TEXT = "Active le tracé pour dessiner en glissant";

// Au doigt on touche, à la souris on clique : la bulle du premier passage en Dessin dit celui des deux qui sert.
export const draftText = (isTouchScreen: boolean): string =>
  `${isTouchScreen ? "Touche le canvas" : "Clique sur le canvas"} pour préparer ton dessin, Valider l'envoie`;

const MS_PER_SECOND = 1000;

// Du plus grand au plus petit : l'intervalle se dit en ses unités non nulles, ou par le nom de l'unité s'il en vaut exactement une.
const UNITS = [
  { seconds: 3600, short: "h", every: "toutes les heures" },
  { seconds: 60, short: "min", every: "toutes les minutes" },
  { seconds: 1, short: "s", every: "toutes les secondes" },
] as const;

// L'intervalle d'une recharge, dit comme on le lit : « toutes les 10 s », « toutes les minutes », « toutes les 1 min 30 s ».
export function everyText(ms: number): string {
  if (ms < MS_PER_SECOND) return `toutes les ${ms} ms`;
  let rest = Math.round(ms / MS_PER_SECOND);
  const parts: string[] = [];
  for (const { seconds, short, every } of UNITS) {
    const count = Math.floor(rest / seconds);
    rest -= count * seconds;
    if (count === 1 && rest === 0 && parts.length === 0) return every;
    if (count > 0) parts.push(`${count} ${short}`);
  }
  return `toutes les ${parts.join(" ")}`;
}

// Un pixel, ou plusieurs quand la recharge en rend plusieurs d'un coup.
export const pixelsText = (count: number): string => (count === 1 ? "un pixel" : `${count} pixels`);

// Avant le `welcome`, le canvas n'a pas ses chiffres : la bulle ne les invente pas.
export const gaugeText = (refill: Refill | undefined): string =>
  refill
    ? `Ta jauge se recharge toute seule : ${pixelsText(refill.refillCharges)} ${everyText(refill.refillMs)}`
    : "Ta jauge se recharge toute seule";
