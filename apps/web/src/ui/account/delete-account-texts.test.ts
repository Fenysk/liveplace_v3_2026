import { describe, expect, it } from "vitest";
import { DELETE_ACCOUNT_TEXTS } from "./delete-account-texts";

describe("the sentences of the account deletion in both languages (CDC §8, §9.9)", () => {
  // Les mots de la ligne de Mon compte et du toast de l'accueil, dans chaque langue
  it("says the row of My account and the toast of the home page in each language", () => {
    expect(DELETE_ACCOUNT_TEXTS.fr.rowHint).toBe("Efface tout, sans retour.");
    expect(DELETE_ACCOUNT_TEXTS.fr.deleteAccount).toBe("Supprimer mon compte");
    expect(DELETE_ACCOUNT_TEXTS.fr.deleted).toBe("Compte supprimé");
    expect(DELETE_ACCOUNT_TEXTS.en.rowHint).toBe("Erases everything, no undo.");
    expect(DELETE_ACCOUNT_TEXTS.en.deleteAccount).toBe("Delete my account");
    expect(DELETE_ACCOUNT_TEXTS.en.deleted).toBe("Account deleted");
  });

  // Chaque phrase a sa version dans les deux langues, aucune n'est vide, et l'anglais ne reprend pas le français
  it("has every sentence in both languages, none empty, the English never the French", () => {
    for (const key of Object.keys(DELETE_ACCOUNT_TEXTS.fr) as (keyof typeof DELETE_ACCOUNT_TEXTS.fr)[]) {
      expect(DELETE_ACCOUNT_TEXTS.fr[key], key).not.toBe("");
      expect(DELETE_ACCOUNT_TEXTS.en[key], key).not.toBe("");
      expect(DELETE_ACCOUNT_TEXTS.en[key], key).not.toBe(DELETE_ACCOUNT_TEXTS.fr[key]);
    }
  });

  // « fresque » en français, « canvas » en anglais, jamais l'un dans l'autre ni un mot écarté
  it("says fresque in French and canvas in English, and never the banned words", () => {
    expect(DELETE_ACCOUNT_TEXTS.fr.goesCanvas).toContain("fresque");
    expect(DELETE_ACCOUNT_TEXTS.fr.staysPixels).toContain("fresques");
    expect(DELETE_ACCOUNT_TEXTS.en.goesCanvas).toContain("canvas");
    for (const text of Object.values(DELETE_ACCOUNT_TEXTS.fr))
      expect(text).not.toMatch(/canvas|joueur|utilisateur/i);
    for (const text of Object.values(DELETE_ACCOUNT_TEXTS.en))
      expect(text).not.toMatch(/fresque|player|\buser/i);
  });
});
