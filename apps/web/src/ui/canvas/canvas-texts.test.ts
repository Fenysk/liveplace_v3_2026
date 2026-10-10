import { describe, expect, it } from "vitest";
import { CANVAS_TEXTS } from "./canvas-texts";

const fr = CANVAS_TEXTS.fr;
const en = CANVAS_TEXTS.en;

describe("the sentences of the canvas in both languages (Écart §14, JOURNAL 2026-10-07)", () => {
  // Le nom accessible de la scène dit le propriétaire, et la taille quand elle est connue
  it("names the canvas surface with its owner, and its size once it is known", () => {
    expect(fr.surfaceLabel({ ownerName: "Kalyss", size: { width: 32, height: 32 } })).toBe(
      "Canvas de Kalyss, 32 × 32",
    );
    expect(fr.surfaceLabel({ ownerName: "Kalyss" })).toBe("Canvas de Kalyss");
    expect(en.surfaceLabel({ ownerName: "Kalyss", size: { width: 32, height: 32 } })).toBe(
      "Kalyss's canvas, 32 × 32",
    );
    expect(en.pageTitle("Kalyss")).toBe("Kalyss's canvas");
  });

  // Le zoom s'écrit « 150 % » en français, « 150% » en anglais, et sans espace au-delà de 999 en français
  it("writes the zoom percent the way each language does", () => {
    expect(fr.zoomPercent(150)).toBe("150 %");
    expect(fr.zoomPercent(1200)).toBe("1200%");
    expect(en.zoomPercent(150)).toBe("150%");
  });

  // Les pixels refusés d'un envoi : un seul au singulier, le reste au pluriel, avec les milliers de la langue
  it("agrees the refused pixels, with the thousands of the language", () => {
    expect(fr.refused(1)).toBe("1 pixel refusé : il reste dans le brouillon.");
    expect(fr.refused(3)).toBe("3 pixels refusés : ils restent dans le brouillon.");
    expect(en.refused(1)).toBe("1 pixel refused: it stays in the draft.");
    expect(en.refused(1200)).toBe("1,200 pixels refused: they stay in the draft.");
  });

  // Le streamer change de canvas : avec un brouillon, la phrase le dit
  it("says the streamer switched canvas, and that a draft stays on the old one", () => {
    expect(fr.switched({ ownerName: "Kalyss", hasDraft: false })).toBe("Kalyss a changé de canvas.");
    expect(en.switched({ ownerName: "Kalyss", hasDraft: true })).toBe(
      "Kalyss switched canvas: your draft stays on the old one.",
    );
  });

  // La taille en cases, et ce qui sort du cadre, accordé en nombre dans chaque langue
  it("says the size in cells, and what falls outside the frame in the right number", () => {
    expect(fr.cellsLabel({ width: 64, height: 36 })).toBe("64 × 36 cases");
    expect(en.cellsLabel({ width: 64, height: 36 })).toBe("64 × 36 cells");
    expect(fr.outsideSentence(1)).toBe(
      "1 pixel sort du cadre : gardés, invisibles, ils reviennent quand le canvas s'agrandit.",
    );
    expect(fr.outsideSentence(2)).toContain("2 pixels sortent du cadre");
    expect(en.outsideSentence(1)).toBe(
      "1 pixel falls outside the frame: kept, invisible, it comes back when the canvas grows.",
    );
    expect(en.outsideSentence(2)).toContain("2 pixels fall outside the frame");
    expect(en.outsideSentence(2)).toContain("they come back");
  });

  // Chaque format et chaque taille ont leur nom dans chaque langue
  it("names every format and every size in each language", () => {
    expect(fr.formatNames["16:9"]).toBe("Paysage 16:9");
    expect(en.formatNames["9:16"]).toBe("Portrait 9:16");
    expect(en.formatNames["4:3"]).toBe("Landscape 4:3");
    expect([fr.sizeNames["0"], fr.sizeNames["1"], fr.sizeNames["2"]]).toEqual(["Petit", "Moyen", "Grand"]);
    expect([en.sizeNames["0"], en.sizeNames["1"], en.sizeNames["2"]]).toEqual(["Small", "Medium", "Large"]);
  });
});
