import { describe, expect, it } from "vitest";
import type { Scoreboard } from "./canvas-store";
import { toScoreboardRows } from "./scoreboard";

const top = [
  { login: "ada", displayName: "Ada", pixels: 90 },
  { login: "bob", displayName: "Bob", avatarUrl: "https://static-cdn.jtvnw.net/bob.png", pixels: 40 },
  { login: "eve", displayName: "Eve", pixels: 40 },
  { login: "kim", displayName: "Kim", pixels: 7 },
  { login: "lea", displayName: "Léa", pixels: 3 },
];

const me = { login: "moi", displayName: "Moi", avatarUrl: "https://static-cdn.jtvnw.net/moi.png" };

const logins = (rows: readonly { player: { login: string } }[]) => rows.map(({ player }) => player.login);

describe("the scoreboard rows (JOURNAL 2026-10-06)", () => {
  // N'a aucune ligne sans classement, ni pour un classement vide
  it("has no row without a scoreboard, or for an empty one", () => {
    expect(toScoreboardRows(undefined, me)).toEqual({ top: [], outside: null });
    expect(toScoreboardRows({ top: [] }, me)).toEqual({ top: [], outside: null });
  });

  // Garde l'ordre du serveur, une égalité comprise, et numérote les rangs à partir de 1
  it("keeps the server's order, a tie included, and numbers the ranks from 1", () => {
    const { top: rows } = toScoreboardRows({ top }, undefined);

    expect(logins(rows)).toEqual(["ada", "bob", "eve", "kim", "lea"]);
    expect(rows.map(({ rank, pixels }) => [rank, pixels])).toEqual([
      [1, 90],
      [2, 40],
      [3, 40],
      [4, 7],
      [5, 3],
    ]);
  });

  // Garde la photo d'un joueur quand il en a une, et rien sinon
  it("keeps the photo of a player who has one, and nothing otherwise", () => {
    const { top: rows } = toScoreboardRows({ top }, undefined);

    expect(rows[1]?.player).toEqual({
      login: "bob",
      displayName: "Bob",
      avatarUrl: "https://static-cdn.jtvnw.net/bob.png",
    });
    expect(rows[0]?.player).toEqual({ login: "ada", displayName: "Ada" });
  });

  // Ne met personne en évidence pour un invité, qui n'a pas de place
  it("highlights nobody for a guest, who has no place", () => {
    const rows = toScoreboardRows({ top }, undefined);

    expect(rows.top.some(({ isMe }) => isMe)).toBe(false);
    expect(rows.outside).toBeNull();
  });

  // Met en évidence sa propre ligne à sa place quand on est dans le top, sans la répéter dessous
  it("highlights one's own row at its place when in the top, without repeating it below", () => {
    const scoreboard: Scoreboard = { top, you: { rank: 3, pixels: 40 } };

    const rows = toScoreboardRows(scoreboard, me);

    expect(rows.top.map(({ isMe }) => isMe)).toEqual([false, false, true, false, false]);
    expect(rows.top[2]?.player.login).toBe("eve");
    expect(rows.outside).toBeNull();
  });

  // Met sa place à part, sous le top, quand on est hors du top : son identité, son rang, ses pixels
  it("puts one's place apart, below the top, when outside it: one's identity, rank and pixels", () => {
    const rows = toScoreboardRows({ top, you: { rank: 12, pixels: 2 } }, me);

    expect(rows.top.some(({ isMe }) => isMe)).toBe(false);
    expect(rows.outside).toEqual({ rank: 12, pixels: 2, player: me, isMe: true });
  });

  // Compte un joueur seul dans le top comme dedans, jamais comme à part
  it("counts a lone player of the top as inside, never as apart", () => {
    const rows = toScoreboardRows({ top: top.slice(0, 1), you: { rank: 1, pixels: 90 } }, me);

    expect(rows.top.map(({ isMe }) => isMe)).toEqual([true]);
    expect(rows.outside).toBeNull();
  });

  // Ne dessine pas une ligne à part pour une identité inconnue
  it("draws no row apart for an unknown identity", () => {
    expect(toScoreboardRows({ top, you: { rank: 12, pixels: 2 } }, undefined).outside).toBeNull();
  });
});
