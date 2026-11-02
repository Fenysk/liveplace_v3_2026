import { describe, expect, it } from "vitest";
import { currentSectionId } from "./current-section";

const SECTIONS = [
  { id: "a", top: 0 },
  { id: "b", top: 400 },
  { id: "c", top: 900 },
];

describe("la section courante d'un document (JOURNAL 2026-11-02)", () => {
  // Quand la page est tout en haut, avant le haut de la première section, la première reste la courante
  it("keeps the first section current while none has reached the line", () => {
    const below = SECTIONS.map(({ id, top }) => ({ id, top: top + 600 }));

    expect(currentSectionId(below, 200, false)).toBe("a");
  });

  // Quand le haut d'une section passe la ligne, elle devient la courante, et seulement elle
  it("makes a section current once its top reaches the line", () => {
    expect(currentSectionId(SECTIONS, 200, false)).toBe("a");
    expect(currentSectionId(SECTIONS, 400, false)).toBe("b");
    expect(currentSectionId(SECTIONS, 899, false)).toBe("b");
    expect(currentSectionId(SECTIONS, 900, false)).toBe("c");
  });

  // Une section plus courte que le défilement d'une image est quand même celle qu'on a dépassée en dernier
  it("takes the last section above the line, even when the sections below are far", () => {
    expect(currentSectionId(SECTIONS, 5000, false)).toBe("c");
  });

  // Sans section (la page change), le sommaire n'a pas de courante
  it("names no section when there is none", () => {
    expect(currentSectionId([], 200, false)).toBe("");
    expect(currentSectionId([], 200, true)).toBe("");
  });

  // Quand le bas de la page est atteint, la dernière section est la courante, même si son haut n'a jamais pu passer la ligne
  it("makes the last section current at the end of the page, whatever the line says", () => {
    const farBelow = SECTIONS.map(({ id, top }) => ({ id, top: top + 300 }));

    expect(currentSectionId(farBelow, 200, false)).toBe("a");
    expect(currentSectionId(farBelow, 200, true)).toBe("c");
  });
});
