import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Les anneaux du podium (Classement) : une couleur pleine par place, au moins 3:1 sur la surface (WCAG 1.4.11, contraste d'un élément graphique).

const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
const scoreboardCss = readFileSync(join(import.meta.dirname, "scoreboard.css"), "utf8");
const sectionOf = (opening: string): string => {
  const start = tokens.indexOf(opening);
  return tokens.slice(start, tokens.indexOf("\n}", start));
};
const light = sectionOf(':root,\n[data-appearance="light"] {');
const dark = sectionOf('[data-appearance="dark"] {');
const PLACES = ["gold", "silver", "bronze"] as const;

const variableValue = (block: string, name: string): string =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? "";
const toRgb = (hex: string): number[] =>
  [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
const luminance = (rgb: number[]): number => {
  const [red = 0, green = 0, blue = 0] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first: number[], second: number[]): number => {
  const [high = 0, low = 0] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (high + 0.05) / (low + 0.05);
};

describe("les anneaux du classement (tokens.css, scoreboard.css)", () => {
  // Quand un joueur est au podium, son anneau est la couleur pleine de sa place, jamais un dégradé
  it("paints each podium ring in the solid color of its place, with no gradient", () => {
    PLACES.forEach((place, index) => {
      const rule = new RegExp(`\\.lp-rank-ring--${index + 1} \\{([^}]*)\\}`).exec(scoreboardCss)?.[1] ?? "";
      expect(rule.trim()).toBe(`background: var(--rank-${place}-from);`);
    });
    expect(scoreboardCss).not.toMatch(/gradient/);
  });

  // Chaque apparence donne une couleur par place, et plus aucune couleur de fin de dégradé
  it("gives each theme one color per place, and no second color", () => {
    for (const block of [light, dark]) {
      for (const place of PLACES)
        expect(variableValue(block, `--rank-${place}-from`)).toMatch(/^#[0-9a-f]{6}$/);
      expect(block).not.toMatch(/--rank-\w+-to/);
    }
  });

  // Chaque anneau tient au moins 3:1 sur la surface de la pill, dans les deux apparences
  it("keeps every ring at 3:1 on the pill surface, in both themes", () => {
    for (const block of [light, dark]) {
      const surface = toRgb(variableValue(block, "--pill-surface"));
      for (const place of PLACES)
        expect(contrast(toRgb(variableValue(block, `--rank-${place}-from`)), surface)).toBeGreaterThanOrEqual(
          3,
        );
    }
  });
});
