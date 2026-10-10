import { describe, expect, it } from "vitest";
import { cardName, cardTheme } from "./card-text";

const owner = (displayName: string) => ({ displayName, login: "fenysk" });

describe("le nom écrit sur la carte d'aperçu", () => {
  // Quand le nom tient dans Nunito latin, accents et ponctuation compris, le système doit l'écrire tel quel
  it("writes a name as it is when Nunito latin covers it, accents and punctuation included", () => {
    for (const displayName of ["Fenysk", "Étoile Ñandú", "Zoé–Ré · 2", "Bob_the_Builder", "Œuvre"])
      expect(cardName(owner(displayName))).toBe(displayName);
  });

  // Si le nom a une lettre, un emoji ou un alphabet que la police ne couvre pas, alors le système doit écrire le login
  it("writes the login when the name has a letter, an emoji or an alphabet the font does not cover", () => {
    for (const displayName of ["Łukasz", "ゆうき", "Bob 🎮", "Ωmega", "Тест"])
      expect(cardName(owner(displayName))).toBe("fenysk");
  });
});

describe("le thème écrit sur la carte d'aperçu", () => {
  // Quand le thème tient dans Nunito latin, le système doit l'écrire tel quel, sans thème rien
  it("writes a theme as it is when Nunito latin covers it, and nothing without one", () => {
    expect(cardTheme("Été à la plage")).toBe("Été à la plage");
    expect(cardTheme(undefined)).toBeUndefined();
  });

  // Si le thème porte des emoji ou une lettre que la police ne couvre pas, alors le système doit les effacer et recoller les espaces
  it("erases the emoji and the letters the font does not cover, and tidies the spaces", () => {
    expect(cardTheme("Un 🐱 dans l'espace 🚀")).toBe("Un dans l'espace");
    expect(cardTheme("Chat 猫 noir")).toBe("Chat noir");
  });

  // Si rien du thème n'est couvert, alors le système ne doit écrire aucun thème
  it("writes no theme when nothing of it is covered", () => {
    expect(cardTheme("🐱🚀")).toBeUndefined();
    expect(cardTheme("   ")).toBeUndefined();
  });
});
