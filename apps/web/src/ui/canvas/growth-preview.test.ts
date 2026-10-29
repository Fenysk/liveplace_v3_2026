import { readFileSync } from "node:fs";
import { createElement, createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGrowthPreview, type GrowthPreviewInput, previewGrowth } from "./growth-preview";
import { GrowthPreview } from "./growth-preview-layers";

// Écart §9.3 (JOURNAL 2026-10-29) : l'aperçu de la croissance. Ce qui le nourrit (la règle du serveur), et ce qu'il écrit dans ses couches.

const input = (overrides: Partial<GrowthPreviewInput> = {}): GrowthPreviewInput => ({
  isDynamicSize: true,
  mode: "draft",
  draft: [],
  aimedCell: null,
  colorIndex: 5,
  isPicking: false,
  canvas: { width: 10, height: 10 },
  ...overrides,
});

describe("previewGrowth (Écart §9.3, JOURNAL 2026-10-29)", () => {
  // Rien au repos : ni viseur, ni brouillon
  it("shows nothing at rest", () => {
    expect(previewGrowth(input())).toBeNull();
  });

  // Viser la colonne 0 d'une 10 × 10 : 3 colonnes à gauche ; la colonne 7 : 1 à droite
  it("adds 3 columns on the left for the aimed column 0, 1 on the right for column 7", () => {
    expect(previewGrowth(input({ aimedCell: { x: 0, y: 5 } }))).toEqual({
      left: 3,
      top: 0,
      right: 0,
      bottom: 0,
    });
    expect(previewGrowth(input({ aimedCell: { x: 7, y: 5 } }))).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 0,
    });
  });

  // Une case au milieu n'ajoute rien
  it("adds nothing for an aimed cell with three empty cells around it", () => {
    expect(previewGrowth(input({ aimedCell: { x: 4, y: 4 } }))).toBeNull();
  });

  // Le brouillon seul déclenche l'aperçu, sans survol : c'est le cas du toucher
  it("shows from the draft alone, with nothing aimed", () => {
    expect(previewGrowth(input({ draft: [{ x: 9, y: 4, colorIndex: 5 }] }))).toEqual({
      left: 0,
      top: 0,
      right: 3,
      bottom: 0,
    });
  });

  // Le brouillon et la case visée se comptent ensemble
  it("counts the draft and the aimed cell together", () => {
    expect(
      previewGrowth(input({ draft: [{ x: 9, y: 4, colorIndex: 5 }], aimedCell: { x: 1, y: 0 } })),
    ).toEqual({ left: 2, top: 3, right: 3, bottom: 0 });
  });

  // La gomme n'ajoute aucun pixel, au brouillon comme au bout du pointeur ; la pipette ne pose rien
  it("ignores erasers in the draft, an eraser aimed, and the eyedropper", () => {
    expect(previewGrowth(input({ draft: [{ x: 9, y: 4, colorIndex: 0 }] }))).toBeNull();
    expect(previewGrowth(input({ aimedCell: { x: 0, y: 5 }, colorIndex: 0 }))).toBeNull();
    expect(previewGrowth(input({ aimedCell: { x: 0, y: 5 }, isPicking: true }))).toBeNull();
  });

  // Jamais en Vue, jamais à taille fixe
  it("never shows in view mode, nor on a fixed-size canvas", () => {
    const aimed = { aimedCell: { x: 0, y: 5 }, draft: [{ x: 9, y: 4, colorIndex: 5 }] };

    expect(previewGrowth(input({ ...aimed, mode: "view" }))).toBeNull();
    expect(previewGrowth(input({ ...aimed, isDynamicSize: false }))).toBeNull();
  });

  // Au plafond de 256, il n'y a plus rien à montrer de ce côté
  it("shows nothing on an axis at its ceiling", () => {
    expect(
      previewGrowth(input({ aimedCell: { x: 255, y: 5 }, canvas: { width: 256, height: 20 } })),
    ).toBeNull();
  });
});

// Les trois pièces, faussées : de quoi lire ce qui leur est écrit
const fakeLayers = () => {
  const writes: string[] = [];
  return {
    writes,
    elements: {
      root: {
        classList: {
          toggle: (name: string, force: boolean) => {
            writes.push(`${name}:${force}`);
            return force;
          },
        },
      },
      checker: { style: { setProperty: (name: string, value: string) => writes.push(`${name}=${value}`) } },
      outline: { setAttribute: (name: string, value: string) => writes.push(`${name}=${value}`) },
    },
  };
};

describe("createGrowthPreview (Écart §9.3, JOURNAL 2026-10-29)", () => {
  const screen = { width: 400, height: 300 };
  const box = { left: 100, top: 50, width: 200, height: 160 };

  // Le damier se découpe à la fresque agrandie, le contour la suit à deux pixels, et l'aperçu paraît
  it("clips the checker to the grown canvas, outlines it two pixels outside, and shows", () => {
    const { writes, elements } = fakeLayers();

    createGrowthPreview(elements)(box, screen);

    expect(writes).toEqual([
      "--lp-checker-clip=inset(50px 100px 90px 100px)",
      "x=98",
      "y=48",
      "width=204",
      "height=164",
      "is-shown:true",
    ]);
  });

  // Rien n'est réécrit tant que la forme ne bouge pas
  it("writes nothing again while the shape stays the same", () => {
    const { writes, elements } = fakeLayers();
    const show = createGrowthPreview(elements);
    show(box, screen);
    writes.length = 0;

    show({ ...box }, screen);

    expect(writes).toEqual([]);
  });

  // Retiré, l'aperçu garde sa forme le temps du fondu, et ne se retire qu'une fois
  it("hides once, keeping its shape for the fade, and shows again at the next one", () => {
    const { writes, elements } = fakeLayers();
    const show = createGrowthPreview(elements);
    show(box, screen);
    writes.length = 0;

    show(null, screen);
    show(null, screen);
    expect(writes).toEqual(["is-shown:false"]);

    show(box, screen);
    expect(writes.at(-1)).toBe("is-shown:true");
  });

  // La forme qui bouge (la case visée change) s'écrit sans refaire l'apparition
  it("rewrites the shape when it moves", () => {
    const { writes, elements } = fakeLayers();
    const show = createGrowthPreview(elements);
    show(box, screen);
    writes.length = 0;

    show({ ...box, left: 70, width: 230 }, screen);

    expect(writes).toContain("x=68");
    expect(writes).toContain("width=234");
  });
});

describe("les couches de l'aperçu de la croissance (Écart §9.3, JOURNAL 2026-10-29)", () => {
  const css = readFileSync(new URL("../design/canvas.css", import.meta.url), "utf8");
  const rule = (selector: string): string => {
    const found = css.match(new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{([^}]*)\\}`));
    return found?.[1] ?? "";
  };

  // Un damier découpé et un contour, décoratifs, que la page décrit ailleurs : aucun n'est annoncé
  it("renders the checker and the outline, hidden from assistive technology", () => {
    const refs = {
      root: createRef<HTMLDivElement>(),
      checker: createRef<HTMLDivElement>(),
      tiles: createRef<HTMLDivElement>(),
      outline: createRef<SVGRectElement>(),
    };

    const html = renderToString(createElement(GrowthPreview, { refs }));
    const contained = renderToString(createElement(GrowthPreview, { refs, isContained: true }));

    expect(html).toContain('class="lp-growth-preview"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("lp-checker-tiles");
    expect(html).toContain("<rect");
    expect(contained).toContain("lp-growth-preview--contained");
    expect(html).not.toContain("style=");
  });

  // Fondu sur la durée des apparitions (nulle en mouvement réduit), aucun clic, rien tant qu'il n'est pas montré
  it("fades on --lp-dur-fade, takes no click, and is invisible until shown", () => {
    const preview = rule(".lp-growth-preview");

    expect(preview).toContain("pointer-events: none");
    expect(preview).toContain("opacity: 0");
    expect(preview).toContain("transition: opacity var(--lp-dur-fade) ease");
    expect(rule(".lp-growth-preview.is-shown")).toContain("opacity: 1");
  });

  // Le damier à 35 %, et le contour de la bordure à 70 %, 5 px de trait pour 4 de vide
  it("draws the checker at 35% and a dashed outline of the border color at 70%, 5 px on and 4 off", () => {
    const outline = rule(".lp-growth-preview-outline rect");

    expect(rule(".lp-growth-preview .lp-checker")).toContain("opacity: 0.35");
    expect(outline).toContain("stroke: var(--canvas-border)");
    expect(outline).toContain("stroke-opacity: 0.7");
    expect(outline).toContain("stroke-dasharray: 5 4");
  });
});
