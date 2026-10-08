import { describe, expect, it } from "vitest";
import { judgeChunk } from "./chunk-order";

const incoming = { fromVersion: 11, toVersion: 20, count: 10 };

describe("judgeChunk (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Le premier chunk d'un canvas se range, quel que soit son intervalle
  it("accepts the first chunk of a canvas", () => {
    expect(judgeChunk(incoming, undefined)).toBe("accepted");
  });

  // Un chunk qui commence après le dernier se range, avec ou sans trou entre les deux
  it("accepts a chunk that starts after the last one, with or without a gap between", () => {
    expect(judgeChunk(incoming, { toVersion: 10 })).toBe("accepted");
    expect(judgeChunk(incoming, { toVersion: 4 })).toBe("accepted");
  });

  // Un chunk qui reprend la dernière version rangée, ou une plus basse, chevauche : refusé
  it("refuses a chunk that overlaps the last one", () => {
    expect(judgeChunk(incoming, { toVersion: 11 })).toBe("overlap");
    expect(judgeChunk(incoming, { toVersion: 20 })).toBe("overlap");
    expect(judgeChunk(incoming, { toVersion: 500 })).toBe("overlap");
  });

  // Un intervalle à l'envers ou sans entrée n'est pas un chunk
  it("refuses an interval that is backwards or empty", () => {
    expect(judgeChunk({ fromVersion: 20, toVersion: 11, count: 10 }, undefined)).toBe("invalid");
    expect(judgeChunk({ fromVersion: 11, toVersion: 20, count: 0 }, undefined)).toBe("invalid");
  });
});
