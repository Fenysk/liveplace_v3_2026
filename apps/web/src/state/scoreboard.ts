// Le classement tel que l'écran le range (JOURNAL 2026-10-06) : le top dans l'ordre du serveur, et qui regarde, à
// part quand il n'est pas dans le top.

import type { Scoreboard } from "./canvas-store";

export type ScoreboardPlayer = { displayName: string; login: string; avatarUrl?: string | undefined };

export type ScoreboardRow = { rank: number; pixels: number; player: ScoreboardPlayer; isMe: boolean };

// `outside` : la place de qui regarde quand le top ne la contient pas.
export type ScoreboardRows = { top: readonly ScoreboardRow[]; outside: ScoreboardRow | null };

export function toScoreboardRows(
  scoreboard: Scoreboard | undefined,
  me: ScoreboardPlayer | undefined,
): ScoreboardRows {
  const entries = scoreboard?.top ?? [];
  const you = scoreboard?.you;
  const top = entries.map(({ login, displayName, avatarUrl, pixels }, index): ScoreboardRow => {
    const rank = index + 1;
    return {
      rank,
      pixels,
      player: { login, displayName, ...(avatarUrl ? { avatarUrl } : {}) },
      isMe: you?.rank === rank,
    };
  });
  const isOutside = you !== undefined && you.rank > top.length;
  return {
    top,
    outside: isOutside && me ? { rank: you.rank, pixels: you.pixels, player: me, isMe: true } : null,
  };
}
