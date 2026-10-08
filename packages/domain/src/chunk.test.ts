import { describe, expect, it } from "vitest";
import { listChunkGaps, listGaps, type Recovered } from "./chunk";

describe("listGaps (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Quand chaque version après le curseur a son entrée, rien n'est noté
  it("notes nothing when every version has its entry", () => {
    expect(listGaps(10, [11, 12, 13], null)).toEqual({});
  });

  // Quand le flux a perdu ses premières entrées (MAXLEN), le trou court du curseur à la première entrée
  it("notes the versions the stream lost before its first entry", () => {
    expect(listGaps(0, [41_000, 41_001], null)).toEqual({ gaps: [{ from: 1, to: 40_999 }] });
  });

  // Quand une version manque entre deux entrées, le trou est noté avec ses deux bornes
  it("notes a hole between two entries, with both bounds", () => {
    expect(listGaps(10, [11, 15, 16, 20], null)).toEqual({
      gaps: [
        { from: 12, to: 14 },
        { from: 17, to: 19 },
      ],
    });
  });

  // Quand la seule version qui manque est celle de la dernière taille, c'est un changement de taille, pas une perte
  it("takes a one-version hole at the last known resize for a resize, not a loss", () => {
    expect(listGaps(10, [11, 13], 12)).toEqual({ resizedAt: 12 });
  });

  // Quand un trou plus grand entoure la taille, il reste un trou : rien n'autorise à l'expliquer
  it("keeps a bigger hole around the resize as a gap", () => {
    expect(listGaps(10, [11, 15], 12)).toEqual({ gaps: [{ from: 12, to: 14 }] });
  });

  // Quand la taille est celle d'un autre intervalle, elle ne se note pas ici
  it("ignores a resize that is not a hole of this interval", () => {
    expect(listGaps(10, [11, 12, 14], 30)).toEqual({ gaps: [{ from: 13, to: 13 }] });
  });

  // Quand un trou de perte et un changement de taille se suivent, les deux sont notés
  it("notes a loss and a resize together", () => {
    expect(listGaps(0, [5, 7, 8], 6)).toEqual({ gaps: [{ from: 1, to: 4 }], resizedAt: 6 });
  });
});

// Écart §7.2 (JOURNAL 2026-10-08, amendé) : une récupération saute de version, et les versions perdues avant elle se notent.
describe("listChunkGaps (Écart §7.2, JOURNAL 2026-10-08)", () => {
  const recovered = (snapshotVersion: number): Recovered => ({
    at: 1_700_000_000_000,
    version: 1_000_275,
    snapshotVersion,
  });

  // Sans récupération, ce sont les trous du flux, comme listGaps
  it("gives the holes of the stream alone when there was no recovery", () => {
    expect(listChunkGaps(10, [11, 15], null, null)).toEqual(listGaps(10, [11, 15], null));
  });

  // Curseur à 3, sauvegarde à 275 : les versions 4 à 275 n'ont jamais été archivées, elles se notent ; 276 à 1 000 275 n'ont jamais existé
  it("notes the versions lost between the archive cursor and the restored save, not the jump above it", () => {
    expect(listChunkGaps(3, [1_000_276, 1_000_277], null, recovered(275))).toEqual({
      gaps: [{ from: 4, to: 275 }],
    });
  });

  // Curseur à 300, sauvegarde à 275 : tout ce que la sauvegarde porte était déjà archivé, rien n'est perdu
  it("notes nothing when the restored save is older than the archive cursor", () => {
    expect(listChunkGaps(300, [1_000_276], null, recovered(275))).toEqual({});
  });

  // Curseur égal à la sauvegarde : rien n'est perdu non plus
  it("notes nothing when the archive cursor is exactly the restored save", () => {
    expect(listChunkGaps(275, [1_000_276], null, recovered(275))).toEqual({});
  });

  // Un trou après le saut reste noté, à la suite des versions perdues avant la récupération
  it("keeps a hole after the jump, after the versions lost before the recovery", () => {
    expect(listChunkGaps(3, [1_000_276, 1_000_279], null, recovered(275))).toEqual({
      gaps: [
        { from: 4, to: 275 },
        { from: 1_000_277, to: 1_000_278 },
      ],
    });
  });

  // Une taille changée après la récupération se note comme telle, à côté des versions perdues
  it("still takes a resize after the jump for a resize", () => {
    expect(listChunkGaps(3, [1_000_276, 1_000_278], 1_000_277, recovered(275))).toEqual({
      gaps: [{ from: 4, to: 275 }],
      resizedAt: 1_000_277,
    });
  });

  // Une récupération que le curseur a déjà dépassée (son chunk est rangé) ne note plus rien de plus
  it("goes back to the holes of the stream once the cursor is past the recovery", () => {
    expect(listChunkGaps(1_000_276, [1_000_277, 1_000_279], null, recovered(275))).toEqual({
      gaps: [{ from: 1_000_278, to: 1_000_278 }],
    });
  });
});
