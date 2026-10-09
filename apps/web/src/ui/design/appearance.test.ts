import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CHOICES,
  APPEARANCE_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  type Appearance,
  nextAppearanceChoice,
  resolveAppearance,
  toAppearanceChoice,
} from "./appearance";

// Le script d'avant la première peinture, exécuté contre un faux navigateur.
const runAppearanceScript = (
  saved: string | null,
  isSystemDark: boolean,
  isStorageBlocked = false,
): string => {
  const root: { dataset: { appearance?: string } } = { dataset: {} };
  const storage = {
    getItem: (key: string) => {
      if (isStorageBlocked) throw new Error("stockage refusé");
      return key === APPEARANCE_STORAGE_KEY ? saved : null;
    },
  };
  const systemQuery = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && isSystemDark,
  });
  new Function("localStorage", "matchMedia", "document", APPEARANCE_SCRIPT)(storage, systemQuery, {
    documentElement: root,
  });
  return root.dataset.appearance ?? "";
};

describe("appearance", () => {
  // Quand aucun choix n'est enregistré, l'apparence est auto (CDC 2026 : auto au premier chargement)
  it("donne auto sans choix enregistré", () => {
    expect(toAppearanceChoice(null)).toBe("auto");
  });

  // Si le choix enregistré est illisible, alors l'apparence est auto, jamais une erreur
  it("donne auto pour un choix illisible", () => {
    expect(toAppearanceChoice("violet")).toBe("auto");
    expect(toAppearanceChoice("")).toBe("auto");
  });

  it("relit un choix enregistré", () => {
    for (const choice of APPEARANCE_CHOICES) expect(toAppearanceChoice(choice)).toBe(choice);
  });

  // Quand on renomme l'apparence, la clé du navigateur garde sa valeur : aucun joueur ne perd son choix
  it("garde la clé du navigateur d'avant le renommage, pour que personne ne perde son choix", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("liveplace:theme");
  });

  // Le bouton de la pill Compte passe de auto à clair, de clair à sombre, de sombre à auto
  it("fait le cycle auto, clair, sombre", () => {
    expect(nextAppearanceChoice("auto")).toBe("light");
    expect(nextAppearanceChoice("light")).toBe("dark");
    expect(nextAppearanceChoice("dark")).toBe("auto");
  });

  // Tant que le choix est auto, l'apparence suit le système ; un choix explicite l'emporte
  it("suit le système en auto seulement", () => {
    expect(resolveAppearance("auto", true)).toBe("dark");
    expect(resolveAppearance("auto", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });

  // Le script pose la même apparence que resolveAppearance, pour chaque choix enregistré et chaque système
  it("pose avant la peinture l'apparence que l'app posera ensuite", () => {
    const savedValues = [null, "violet", ...APPEARANCE_CHOICES];
    for (const saved of savedValues)
      for (const isSystemDark of [true, false]) {
        const expected: Appearance = resolveAppearance(toAppearanceChoice(saved), isSystemDark);
        expect(runAppearanceScript(saved, isSystemDark)).toBe(expected);
      }
  });

  // Si le stockage refuse l'accès, alors le script suit le système au lieu d'échouer
  it("suit le système quand le stockage est refusé", () => {
    expect(runAppearanceScript("light", true, true)).toBe("dark");
    expect(runAppearanceScript("dark", false, true)).toBe("light");
  });
});
