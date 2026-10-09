import { describe, expect, it } from "vitest";
import { wordingOf } from "./use-label-morph";

describe("wordingOf (Écart §9.3, JOURNAL 2026-10-08)", () => {
  // Seuls les chiffres changent : même texte, le bouton ne passe pas en fondu à chaque seconde ni à chaque pixel
  it("gives the same wording when only the digits change", () => {
    expect(wordingOf("Valider · 3")).toBe(wordingOf("Valider · 12"));
    expect(wordingOf("Attendre 12 s")).toBe(wordingOf("Attendre 9 s"));
    expect(wordingOf("Attendre 1 min 05")).toBe(wordingOf("Attendre 2 min 40"));
  });

  // Les mots changent : le texte passe en fondu
  it("gives another wording when the words change", () => {
    expect(wordingOf("Dessiner")).not.toBe(wordingOf("Valider · 3"));
    expect(wordingOf("Valider")).not.toBe(wordingOf("Valider · 3"));
    expect(wordingOf("Valider · 3")).not.toBe(wordingOf("Attendre 12 s"));
  });
});
