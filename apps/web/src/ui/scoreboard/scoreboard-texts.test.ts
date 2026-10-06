import { describe, expect, it } from "vitest";
import { badgeRank, ordinalSuffix, pixelsNumber, rankText, rowLabel } from "./scoreboard-texts";

describe("the words of the scoreboard (JOURNAL 2026-10-06)", () => {
  // Dit le rang en français : 1er, puis 2e, 3e…, sans jamais de dièse
  it("says the rank in French: 1er, then 2e, 3e…, without ever a hash", () => {
    expect([1, 2, 3, 11, 21, 120].map(rankText)).toEqual(["1er", "2e", "3e", "11e", "21e", "120e"]);
    expect([1, 2].map(ordinalSuffix)).toEqual(["er", "e"]);
    expect(rankText(7)).not.toContain("#");
  });

  // Nomme chaque ligne pour un lecteur d'écran : son rang, son pseudo, ses pixels au pluriel français
  it("names each row for a screen reader: its rank, its name, its pixels in French", () => {
    const player = { login: "kalyss", displayName: "Kalyss" };

    expect(rowLabel({ rank: 2, pixels: 1204, player, isMe: false })).toBe(
      `2e, Kalyss, ${(1204).toLocaleString("fr-FR")} pixels`,
    );
    expect(rowLabel({ rank: 1, pixels: 1, player, isMe: true })).toBe("1er, Kalyss, 1 pixel");
  });

  // Écrit le nombre de pixels à la française, sans le mot, pour la ligne dépliée
  it("writes the number of pixels the French way, without the word, for the unfolded row", () => {
    expect(pixelsNumber(120)).toBe("120");
    expect(pixelsNumber(1204)).toBe((1204).toLocaleString("fr-FR"));
    expect(pixelsNumber(1204)).not.toContain("pixel");
  });

  // Tient le rang d'une pastille en trois caractères au plus
  it("keeps the rank of a badge within three characters", () => {
    expect([1, 12, 99, 100, 4321].map(badgeRank)).toEqual(["1", "12", "99", "99+", "99+"]);
  });
});
