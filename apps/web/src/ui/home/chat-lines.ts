// Le tchat du faux stream (Écart §9.1, JOURNAL 2026-10-22) : des lignes sans texte, de largeurs variées, qui arrivent en bas
// et poussent les autres vers le haut, à un rythme irrégulier. Tout se déduit du numéro d'une ligne : ni hasard ni horloge,
// le serveur et le navigateur écrivent le même tchat.

export const CHAT_WIDTHS = ["xs", "s", "m", "l", "xl"] as const;
export type ChatWidth = (typeof CHAT_WIDTHS)[number];

// `isLong` : le message passe à la ligne, une seconde barre dessous.
export type ChatLine = { id: number; width: ChatWidth; isLong: boolean };

export const CHAT_CAPACITY = 24; // de quoi couvrir toute la hauteur de la colonne, au-delà de ce qu'elle montre
export const CHAT_DELAY_MIN_MS = 280;
export const CHAT_DELAY_MAX_MS = 1700;

const LONG_ONE_IN = 4;

// Un mélange d'entiers (murmur) : deux numéros voisins donnent des valeurs sans rapport.
const mix = (seed: number): number => {
  let value = Math.imul(seed + 1, 0x9e3779b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return value >>> 0;
};

export const chatLineAt = (id: number): ChatLine => {
  const seed = mix(id);
  return {
    id,
    width: CHAT_WIDTHS[seed % CHAT_WIDTHS.length] ?? "m",
    isLong: (seed >>> 12) % LONG_ONE_IN === 0,
  };
};

// Le temps avant l'arrivée de la ligne `id` : des rafales et des pauses.
export const chatDelayMs = (id: number): number =>
  CHAT_DELAY_MIN_MS + (mix(id + 1000) % (CHAT_DELAY_MAX_MS - CHAT_DELAY_MIN_MS + 1));

export const initialChat = (): readonly ChatLine[] =>
  Array.from({ length: CHAT_CAPACITY }, (_, id) => chatLineAt(id));

export const pushChatLine = (lines: readonly ChatLine[], id: number): readonly ChatLine[] => [
  ...lines.slice(1 - CHAT_CAPACITY),
  chatLineAt(id),
];
