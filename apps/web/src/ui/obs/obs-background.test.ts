import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OBS_BACKGROUNDS } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { CANVAS_TEXTS } from "../canvas/canvas-texts";
import { DESIGN_TEXTS } from "../design/design-texts";
import { obsFillStyle } from "./obs-background";

const tokens = readFileSync(join(import.meta.dirname, "..", "design", "tokens.css"), "utf8");

// Les jetons que la vue OBS lit : le vrai noir et le vrai blanc, les mêmes dans les deux apparences
const PROPERTIES: Record<string, string> = { "--obs-black": "#000000", "--obs-white": "#ffffff" };
const getProperty = (property: string): string => PROPERTIES[property] ?? "";

describe("the fill of the OBS view (CDC 2026 §1)", () => {
  // Le noir et le blanc se lisent dans leur jeton ; le transparent ne lit rien et ne peint rien
  it("paints black and white with their CSS property, and transparent with nothing, reading no property", () => {
    const read: string[] = [];
    const reading = (property: string): string => {
      read.push(property);
      return getProperty(property);
    };

    expect(obsFillStyle("black", reading)).toBe("#000000");
    expect(obsFillStyle("white", reading)).toBe("#ffffff");
    expect(read).toEqual(["--obs-black", "--obs-white"]);
    expect(obsFillStyle("transparent", reading)).toBe("transparent");
    expect(read).toHaveLength(2);
  });

  // Chaque fond peint a son jeton dans tokens.css, au vrai noir et au vrai blanc : sans lui, le fond serait transparent
  it("has its token in tokens.css for every background it paints, the real black and the real white", () => {
    for (const background of OBS_BACKGROUNDS.filter((each) => each !== "transparent"))
      expect(tokens).toContain(`--obs-${background}: ${PROPERTIES[`--obs-${background}`]};`);
  });
});

// Le fond se règle dans la section Fresque (Écart §9.1, JOURNAL 2026-10-10) : son toast est dans les phrases de la fresque
describe("the toast of the saved background (CDC 2026, Toasts)", () => {
  // Dit le fond enregistré par son nom, en minuscules après les deux-points
  it("says the saved background by its name", () => {
    const saved = (background: "transparent" | "black" | "white", locale: "fr" | "en") =>
      CANVAS_TEXTS[locale].backgroundSaved(DESIGN_TEXTS[locale].backgroundNames[background]);

    expect(saved("transparent", "fr")).toBe("Fond enregistré : transparent");
    expect(saved("black", "fr")).toBe("Fond enregistré : noir");
    expect(saved("white", "fr")).toBe("Fond enregistré : blanc");
    expect(saved("black", "en")).toBe("Background saved: black");
    expect(saved("white", "en")).toBe("Background saved: white");
  });
});
