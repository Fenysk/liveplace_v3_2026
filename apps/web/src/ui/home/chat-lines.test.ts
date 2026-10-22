import { describe, expect, it } from "vitest";
import {
  CHAT_CAPACITY,
  CHAT_DELAY_MAX_MS,
  CHAT_DELAY_MIN_MS,
  CHAT_WIDTHS,
  chatDelayMs,
  chatLineAt,
  initialChat,
  pushChatLine,
} from "./chat-lines";

const IDS = Array.from({ length: 60 }, (_, id) => id);

describe("the chat of the fake stream", () => {
  // Les lignes ont des largeurs variées : toutes les largeurs paraissent, et des messages longs passent à la ligne
  it("gives its lines varied widths, some of them on two rows", () => {
    const lines = IDS.map(chatLineAt);

    expect(new Set(lines.map(({ width }) => width))).toEqual(new Set(CHAT_WIDTHS));
    expect(lines.some(({ isLong }) => isLong)).toBe(true);
    expect(lines.some(({ isLong }) => !isLong)).toBe(true);
  });

  // Un tchat arrive à un rythme irrégulier : des délais bornés, jamais deux fois le même d'affilée, des rafales et des pauses
  it("lets lines arrive at an irregular pace, within bounds", () => {
    const delays = IDS.map(chatDelayMs);

    expect(delays.every((ms) => ms >= CHAT_DELAY_MIN_MS && ms <= CHAT_DELAY_MAX_MS)).toBe(true);
    expect(new Set(delays).size).toBeGreaterThan(30);
    expect(delays.some((ms, index) => index > 0 && ms === delays[index - 1])).toBe(false);
    expect(Math.min(...delays)).toBeLessThan(CHAT_DELAY_MIN_MS + 250);
    expect(Math.max(...delays)).toBeGreaterThan(CHAT_DELAY_MAX_MS - 250);
    expect(CHAT_DELAY_MIN_MS).toBeGreaterThan(0);
  });

  // Les mêmes lignes à chaque chargement : le serveur et le navigateur écrivent le même tchat
  it("writes the same chat every time", () => {
    expect(initialChat()).toEqual(initialChat());
    expect(chatLineAt(7)).toEqual(chatLineAt(7));
    expect(chatDelayMs(7)).toBe(chatDelayMs(7));
  });

  // Il remplit d'avance de quoi couvrir toute la hauteur de la colonne
  it("starts with a full column of lines", () => {
    const lines = initialChat();

    expect(CHAT_CAPACITY).toBeGreaterThan(10);
    expect(lines).toHaveLength(CHAT_CAPACITY);
    expect(lines.map(({ id }) => id)).toEqual(Array.from({ length: CHAT_CAPACITY }, (_, id) => id));
  });

  // Une ligne arrive en bas et pousse les autres vers le haut : la plus ancienne sort, la colonne garde sa taille
  it("adds the new line at the bottom and drops the oldest one at the top", () => {
    const lines = initialChat();
    const next = pushChatLine(lines, CHAT_CAPACITY);

    expect(next).toHaveLength(CHAT_CAPACITY);
    expect(next.at(-1)).toEqual(chatLineAt(CHAT_CAPACITY));
    expect(next[0]).toEqual(lines[1]);
    expect(next.map(({ id }) => id)).toEqual(
      lines
        .slice(1)
        .map(({ id }) => id)
        .concat(CHAT_CAPACITY),
    );
  });
});
