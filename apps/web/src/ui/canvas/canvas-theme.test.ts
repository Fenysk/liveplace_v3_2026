import { ARCHIVE_NAME_MAX_LENGTH } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { toNameToSave } from "./canvas-name";

describe("toNameToSave (Écart §15, JOURNAL 2026-10-06)", () => {
  // Rien à enregistrer tant que le nom nettoyé est celui qui l'est déjà : pas d'appel au serveur
  it("has nothing to save while the cleaned name is the saved one", () => {
    expect(toNameToSave("Printemps", "Printemps")).toBeNull();
    expect(toNameToSave("  Printemps  ", "Printemps")).toBeNull();
    expect(toNameToSave("Pixel \n  war", "Pixel war")).toBeNull();
    expect(
      toNameToSave("a".repeat(ARCHIVE_NAME_MAX_LENGTH + 10), "a".repeat(ARCHIVE_NAME_MAX_LENGTH)),
    ).toBeNull();
  });

  // Sans nom enregistré, un champ vide ou d'espaces ne change rien
  it("has nothing to save for an empty or blank field when there is no saved name", () => {
    expect(toNameToSave("", "")).toBeNull();
    expect(toNameToSave("   ", "")).toBeNull();
  });

  // Un autre nom : le nom nettoyé, celui que le serveur gardera
  it("gives the cleaned name when it differs from the saved one", () => {
    expect(toNameToSave("  Hiver  ", "Printemps")).toBe("Hiver");
    expect(toNameToSave("Printemps", "")).toBe("Printemps");
  });

  // Vider le champ retire le nom : le texte vide est ce qu'on envoie
  it("gives an empty text to remove the saved name when the field is emptied", () => {
    expect(toNameToSave("", "Printemps")).toBe("");
    expect(toNameToSave("   ", "Printemps")).toBe("");
  });
});
