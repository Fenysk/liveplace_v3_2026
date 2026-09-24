import { describe, expect, it } from "vitest";
import {
  nextThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  type Theme,
  toThemeChoice,
} from "./theme";

// Le script d'avant la première peinture, exécuté contre un faux navigateur.
const runThemeScript = (saved: string | null, isSystemDark: boolean, isStorageBlocked = false): string => {
  const root: { dataset: { theme?: string } } = { dataset: {} };
  const storage = {
    getItem: (key: string) => {
      if (isStorageBlocked) throw new Error("stockage refusé");
      return key === THEME_STORAGE_KEY ? saved : null;
    },
  };
  const systemQuery = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && isSystemDark,
  });
  new Function("localStorage", "matchMedia", "document", THEME_SCRIPT)(storage, systemQuery, {
    documentElement: root,
  });
  return root.dataset.theme ?? "";
};

describe("theme", () => {
  // Quand aucun choix n'est enregistré, le thème est auto (CDC 2026 : auto au premier chargement)
  it("donne auto sans choix enregistré", () => {
    expect(toThemeChoice(null)).toBe("auto");
  });

  // Si le choix enregistré est illisible, alors le thème est auto, jamais une erreur
  it("donne auto pour un choix illisible", () => {
    expect(toThemeChoice("violet")).toBe("auto");
    expect(toThemeChoice("")).toBe("auto");
  });

  it("relit un choix enregistré", () => {
    for (const choice of THEME_CHOICES) expect(toThemeChoice(choice)).toBe(choice);
  });

  // Le bouton de la pill Compte passe de auto à clair, de clair à sombre, de sombre à auto
  it("fait le cycle auto, clair, sombre", () => {
    expect(nextThemeChoice("auto")).toBe("light");
    expect(nextThemeChoice("light")).toBe("dark");
    expect(nextThemeChoice("dark")).toBe("auto");
  });

  // Tant que le choix est auto, le thème suit le système ; un choix explicite l'emporte
  it("suit le système en auto seulement", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  // Le script pose le même thème que resolveTheme, pour chaque choix enregistré et chaque système
  it("pose avant la peinture le thème que l'app posera ensuite", () => {
    const savedValues = [null, "violet", ...THEME_CHOICES];
    for (const saved of savedValues)
      for (const isSystemDark of [true, false]) {
        const expected: Theme = resolveTheme(toThemeChoice(saved), isSystemDark);
        expect(runThemeScript(saved, isSystemDark)).toBe(expected);
      }
  });

  // Si le stockage refuse l'accès, alors le script suit le système au lieu d'échouer
  it("suit le système quand le stockage est refusé", () => {
    expect(runThemeScript("light", true, true)).toBe("dark");
    expect(runThemeScript("dark", false, true)).toBe("light");
  });
});
