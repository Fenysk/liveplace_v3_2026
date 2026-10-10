import { describe, expect, it } from "vitest";
import { badgeRank, ordinalSuffix, pixelsNumber, rankText, rowLabel } from "./scoreboard-texts";

describe("the words of the scoreboard (JOURNAL 2026-10-06)", () => {
  // Dit le rang en français : 1er, puis 2e, 3e…, sans jamais de dièse
  it("says the rank in French: 1er, then 2e, 3e…, without ever a hash", () => {
    expect([1, 2, 3, 11, 21, 120].map((rank) => rankText(rank, "fr"))).toEqual([
      "1er",
      "2e",
      "3e",
      "11e",
      "21e",
      "120e",
    ]);
    expect([1, 2].map((rank) => ordinalSuffix(rank, "fr"))).toEqual(["er", "e"]);
    expect(rankText(7, "fr")).not.toContain("#");
  });

  // Dit le rang en anglais : 1st, 2nd, 3rd, 4th, et 11th, 12th, 13th malgré leur dernier chiffre
  it("says the rank in English: 1st, 2nd, 3rd, 4th, and 11th to 13th in spite of their last digit", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 120].map((rank) => rankText(rank, "en"))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "120th",
    ]);
    expect(rankText(7, "en")).not.toContain("#");
  });

  // Nomme chaque ligne pour un lecteur d'écran : son rang, son pseudo, ses pixels au pluriel français
  it("names each row for a screen reader: its rank, its name, its pixels in French", () => {
    const player = { login: "kalyss", displayName: "Kalyss" };

    expect(rowLabel({ rank: 2, pixels: 1204, player, isMe: false }, "fr")).toBe(
      `2e, Kalyss, ${(1204).toLocaleString("fr-FR")} pixels`,
    );
    expect(rowLabel({ rank: 1, pixels: 1, player, isMe: true }, "fr")).toBe("1er, Kalyss, 1 pixel");
    expect(rowLabel({ rank: 2, pixels: 1204, player, isMe: false }, "en")).toBe("2nd, Kalyss, 1,204 pixels");
    expect(rowLabel({ rank: 1, pixels: 1, player, isMe: true }, "en")).toBe("1st, Kalyss, 1 pixel");
  });

  // Écrit le nombre de pixels à la française, sans le mot, pour la ligne dépliée
  it("writes the number of pixels the French way, without the word, for the unfolded row", () => {
    expect(pixelsNumber(120, "fr")).toBe("120");
    expect(pixelsNumber(1204, "fr")).toBe((1204).toLocaleString("fr-FR"));
    expect(pixelsNumber(1204, "fr")).not.toContain("pixel");
    expect(pixelsNumber(1204, "en")).toBe("1,204");
  });

  // Tient le rang d'une pastille en trois caractères au plus
  it("keeps the rank of a badge within three characters", () => {
    expect([1, 12, 99, 100, 4321].map(badgeRank)).toEqual(["1", "12", "99", "99+", "99+"]);
  });
});
