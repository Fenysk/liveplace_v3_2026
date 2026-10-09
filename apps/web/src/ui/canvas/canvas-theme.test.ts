import { THEME_MAX_LENGTH } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { toShownTheme, toThemeToSave } from "./canvas-theme";

describe("toThemeToSave (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Rien à enregistrer tant que le thème nettoyé est celui qui l'est déjà : pas d'appel au serveur
  it("has nothing to save while the cleaned theme is the saved one", () => {
    expect(toThemeToSave("Printemps", "Printemps")).toBeNull();
    expect(toThemeToSave("  Printemps  ", "Printemps")).toBeNull();
    expect(toThemeToSave("Pixel \n  war", "Pixel war")).toBeNull();
    expect(toThemeToSave("a".repeat(THEME_MAX_LENGTH + 10), "a".repeat(THEME_MAX_LENGTH))).toBeNull();
  });

  // Sans thème enregistré, un champ vide ou d'espaces ne change rien
  it("has nothing to save for an empty or blank field when there is no saved theme", () => {
    expect(toThemeToSave("", "")).toBeNull();
    expect(toThemeToSave("   ", "")).toBeNull();
  });

  // Un autre thème : le thème nettoyé, celui que le serveur gardera
  it("gives the cleaned theme when it differs from the saved one", () => {
    expect(toThemeToSave("  Hiver  ", "Printemps")).toBe("Hiver");
    expect(toThemeToSave("Printemps", "")).toBe("Printemps");
  });

  // Vider le champ retire le thème : le texte vide est ce qu'on envoie
  it("gives an empty text to remove the saved theme when the field is emptied", () => {
    expect(toThemeToSave("", "Printemps")).toBe("");
    expect(toThemeToSave("   ", "Printemps")).toBe("");
  });
});

describe("toShownTheme (Écart §8.1, JOURNAL 2026-10-07)", () => {
  // Tant que le gateway n'a pas répondu, la page montre le thème de Convex qu'elle a reçu avec elle
  it("shows the theme the page was rendered with until the gateway has answered", () => {
    expect(toShownTheme(undefined, "Halloween")).toBe("Halloween");
    expect(toShownTheme(undefined, undefined)).toBeUndefined();
  });

  // Ensuite le gateway fait foi, et un canvas sans thème n'en a plus, même si la page en avait un
  it("lets the gateway decide once it has answered, a canvas without a theme having none even if the page had one", () => {
    expect(toShownTheme({ theme: "Noël" }, "Halloween")).toBe("Noël");
    expect(toShownTheme({}, "Halloween")).toBeUndefined();
    expect(toShownTheme({ theme: undefined }, "Halloween")).toBeUndefined();
  });
});
