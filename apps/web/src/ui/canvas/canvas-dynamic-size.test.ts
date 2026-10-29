import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasSettings, type DynamicSizeField } from "./canvas-settings";
import { toCanvasSize, toSizeChoice } from "./canvas-size";

// Écart §5.3 (JOURNAL 2026-10-28) : la taille dynamique dans la section Canvas. Activée, le choix de taille reste visible mais grisé
// (JOURNAL 2026-10-29) ; une taille qui n'est dans aucun format est dite telle qu'elle est, sans format présenté comme choisi.

const doNothing = (): void => undefined;

const sectionHtml = (
  dynamic: Partial<DynamicSizeField>,
  current: { width: number; height: number },
): string => {
  const choice = toSizeChoice(current);
  return renderToString(
    createElement(CanvasSettings, {
      theme: { status: "ready", value: "", isSaving: false, onInput: doNothing, onCommit: doNothing },
      background: { value: "transparent", isTouch: false, onPick: doNothing },
      image: {
        imageUrl: null,
        background: "transparent",
        opacity: 40,
        isSending: false,
        onChooseFile: doNothing,
        onClearImage: doNothing,
        onPickOpacity: doNothing,
      },
      dynamic: { isOn: false, isBusy: false, onToggle: doNothing, ...dynamic },
      current,
      choice,
      chosen: choice && toCanvasSize(choice),
      onChoose: doNothing,
      onApply: doNothing,
    }),
  );
};

const checkboxOf = (html: string) => html.match(/<input type="checkbox"[^>]*>/)?.[0] ?? "";

describe("toSizeChoice (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Une taille d'un format se retrouve, celle d'avant les formats garde le grand carré ; une autre n'est nulle part
  it("finds the format of a format size, and none for any other size", () => {
    expect(toSizeChoice({ width: 128, height: 72 })).toEqual({ format: "16:9", sizeIndex: 1 });
    expect(toSizeChoice({ width: 37, height: 41 })).toBeNull();
    expect(toSizeChoice({ width: 10, height: 10 })).toBeNull();
    expect(toSizeChoice({ width: 256, height: 144 })).toEqual({ format: "16:9", sizeIndex: 2 });
    expect(toSizeChoice({ width: 255, height: 256 })).toBeNull();
  });
});

describe("the dynamic size in the Canvas section (Écart §5.3, JOURNAL 2026-10-28)", () => {
  // Désactivée, la case est décochée, les formats reviennent avec Changer la taille
  it("shows an unchecked box and the format choice while it is off", () => {
    const html = sectionHtml({}, { width: 50, height: 50 });

    expect(html).toContain("Taille dynamique");
    expect(checkboxOf(html)).not.toContain("checked");
    expect(html).toContain("Carré");
    expect(html).toContain("Changer la taille");
    expect(html.match(/<input type="radio"[^>]*checked/g)).toHaveLength(2);
  });

  // Activée, la case est cochée ; le format, la taille et Changer la taille restent visibles mais grisés (JOURNAL 2026-10-29), la taille
  // d'un format se lit encore comme choisie
  it("shows a checked box, with the format, the size and the change button visible but disabled while it is on", () => {
    const html = sectionHtml({ isOn: true }, { width: 50, height: 50 });

    expect(checkboxOf(html)).toContain("checked");
    expect(html).toContain("Actuellement 50 × 50 cases.");
    for (const shown of ["1:1", "16:9", "Petit", "Moyen", "Grand", "Changer la taille"])
      expect(html).toContain(shown);
    expect(html.match(/<input type="radio"[^>]*checked/g)).toHaveLength(2);
    expect(html.match(/<input type="radio"/g)).toHaveLength(8);
    expect(html.match(/<input type="radio"[^>]*disabled/g)).toHaveLength(8);
    expect(html).toContain('class="lp-btn lp-type-body lp-btn--primary" disabled');
    expect(html).not.toContain("Rien ne se perd");
  });

  // Activée sur une taille dans aucun format : la taille réelle, aucun format choisi, tout grisé, et plus de consigne pour en choisir un
  it("tells the real size and shows no format chosen, all disabled, when it is on over a size in no format", () => {
    const html = sectionHtml({ isOn: true }, { width: 37, height: 41 });

    expect(html).toContain("Actuellement 37 × 41 cases.");
    expect(html.match(/<input type="radio"/g)).toHaveLength(5);
    expect(html.match(/<input type="radio"[^>]*disabled/g)).toHaveLength(5);
    expect(html.match(/<input type="radio"[^>]*checked/g)).toBeNull();
    expect(html).not.toContain("Cette taille n&#x27;est dans aucun format");
    expect(html).toContain('class="lp-btn lp-type-body lp-btn--primary" disabled');
  });

  // Désactivée, rien n'est grisé : les formats se choisissent, et la taille choisie se confirme
  it("greys nothing while it is off", () => {
    const html = sectionHtml({}, { width: 128, height: 72 });

    expect(html.match(/<input type="radio"/g)).toHaveLength(8);
    expect(html.match(/<input type="radio"[^>]*disabled/g)).toBeNull();
    expect(html).toContain("Rien ne se perd");
  });

  // La demande attend sa réponse : la case ne bouge plus
  it("locks the box while the request waits for its answer", () => {
    expect(checkboxOf(sectionHtml({ isBusy: true }, { width: 50, height: 50 }))).toContain("disabled");
  });

  // Une taille dans aucun format : la taille réelle, aucun format choisi, aucune taille, et rien à changer tant qu'on n'en choisit pas
  it("tells the real size of a size in no format, with no format chosen and nothing to change yet", () => {
    const html = sectionHtml({}, { width: 37, height: 41 });

    expect(html).toContain("Actuellement 37 × 41 cases.");
    expect(html).toContain("Cette taille n&#x27;est dans aucun format");
    expect(html).toContain("1:1");
    expect(html.match(/<input type="radio"[^>]*checked/g)).toBeNull();
    expect(html).not.toContain("Petit");
    expect(html).toContain('class="lp-btn lp-type-body lp-btn--primary" disabled');
  });
});
