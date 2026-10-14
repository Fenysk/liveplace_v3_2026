import { Brush, Eraser, Pipette } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type CursorKind,
  type CursorSituation,
  canvasCursor,
  cursorKind,
  cursorOf,
  TOOL_ICONS,
  toolCursor,
  toolCursorSvg,
} from "./canvas-cursor";

// Le curseur de la fresque à la souris (Écart §9.3, JOURNAL 2026-10-13) : il dit ce que fera le clic.

// Les teintes de tokens.css que la scène donne : `--draft-outline-out` et `--draft-outline-in`.
const SHADES = { ink: "#10121c", halo: "#ffffff" };

const VIEW: CursorSituation = {
  mode: "view",
  isEraser: false,
  isPicking: false,
  isTracing: false,
  isPanning: false,
  willZoom: false,
};
const DRAFT: CursorSituation = { ...VIEW, mode: "draft" };

const SITUATIONS: readonly { name: string; situation: CursorSituation; kind: CursorKind; css: string }[] = [
  { name: "View, the click inspects", situation: VIEW, kind: "inspect", css: "crosshair" },
  {
    name: "View, the cell is too small",
    situation: { ...VIEW, willZoom: true },
    kind: "zoom",
    css: "zoom-in",
  },
  { name: "Moving the view", situation: { ...VIEW, isPanning: true }, kind: "grabbing", css: "grabbing" },
  { name: "Draft, a color", situation: DRAFT, kind: "draw", css: "crosshair" },
  {
    name: "Draft, the eraser",
    situation: { ...DRAFT, isEraser: true },
    kind: "eraser",
    css: toolCursor("eraser", SHADES),
  },
  {
    name: "Draft, the eyedropper",
    situation: { ...DRAFT, isPicking: true },
    kind: "picker",
    css: toolCursor("picker", SHADES),
  },
  {
    name: "Draft, Space held",
    situation: { ...DRAFT, isTracing: true },
    kind: "trace",
    css: toolCursor("trace", SHADES),
  },
];

describe("cursorKind and canvasCursor, one per situation (Écart §9.3, JOURNAL 2026-10-13)", () => {
  // Chaque situation du tableau a son curseur : croix, loupe, main fermée, croix, gomme, pipette, pinceau
  it("picks the cursor of each situation of the table", () => {
    for (const { name, situation, kind, css } of SITUATIONS) {
      expect(cursorKind(situation), name).toBe(kind);
      expect(canvasCursor(situation, SHADES), name).toBe(css);
    }
  });

  // Le déplacement l'emporte sur tout : même avec un outil en main, la vue qui glisse montre la main fermée
  it("shows the closed hand while the view moves, whatever the tool", () => {
    expect(cursorKind({ ...DRAFT, isEraser: true, isPanning: true })).toBe("grabbing");
    expect(cursorKind({ ...DRAFT, isPicking: true, isPanning: true })).toBe("grabbing");
    expect(cursorKind({ ...VIEW, willZoom: true, isPanning: true })).toBe("grabbing");
  });

  // En Dessin, la pipette armée passe avant le tracé, qui passe avant la gomme
  it("puts the eyedropper before the trace, and the trace before the eraser", () => {
    expect(cursorKind({ ...DRAFT, isPicking: true, isTracing: true, isEraser: true })).toBe("picker");
    expect(cursorKind({ ...DRAFT, isTracing: true, isEraser: true })).toBe("trace");
  });

  // En Vue, aucun outil : ni gomme, ni pipette, ni tracé ne changent la croix ou la loupe
  it("ignores every tool in View", () => {
    expect(cursorKind({ ...VIEW, isEraser: true, isPicking: true, isTracing: true })).toBe("inspect");
    expect(cursorKind({ ...VIEW, isEraser: true, willZoom: true })).toBe("zoom");
  });
});

describe("the tool cursors (Écart §9.3, JOURNAL 2026-10-13)", () => {
  const TOOLS = ["eraser", "picker", "trace"] as const;
  const BUTTON_ICONS = { eraser: Eraser, picker: Pipette, trace: Brush };

  // Le tracé de chaque icône est celui du bouton : le même Lucide, pas une copie qui dérive
  it("draws the same icon as the button of the tool", () => {
    for (const kind of TOOLS) {
      const markup = renderToStaticMarkup(createElement(BUTTON_ICONS[kind]));
      const paths = [...markup.matchAll(/ d="([^"]+)"/g)].map(([, path]) => path);

      expect(TOOL_ICONS[kind].paths, kind).toEqual(paths);
    }
  });

  // Une image `data:` que la CSP de prod laisse passer, un point chaud, et la croix en repli
  it("is a data image with a hotspot and the crosshair as a fallback", () => {
    for (const kind of TOOLS) {
      const css = toolCursor(kind, SHADES);

      expect(css, kind).toMatch(/^url\("data:image\/svg\+xml,[^"]+"\) \d+ \d+, crosshair$/);
      expect(cursorOf(kind, SHADES), kind).toBe(css);
    }
  });

  // L'image est un SVG dimensionné, sans rien d'extérieur ni de script, assez petit pour tous les navigateurs
  it("is a sized SVG with nothing external in it, small enough for every browser", () => {
    for (const kind of TOOLS) {
      const svg = toolCursorSvg(TOOL_ICONS[kind], SHADES);

      expect(svg, kind).toMatch(/^<svg [^>]*width="32" height="32" [^>]*>.*<\/svg>$/);
      expect(svg, kind).not.toMatch(/<script|href=|url\(|<image/);
      expect(svg.match(/<path /g), kind).toHaveLength(2 * TOOL_ICONS[kind].paths.length);
    }
  });

  // Un trait sombre cerné d'un trait clair : lisible sur un fond clair comme sur un fond foncé
  it("is a dark stroke edged with a light one, to read on a light or a dark background", () => {
    const svg = toolCursorSvg(TOOL_ICONS.eraser, SHADES);

    expect(svg.indexOf(`stroke="${SHADES.halo}"`)).toBeGreaterThan(-1);
    expect(svg.indexOf(`stroke="${SHADES.ink}"`)).toBeGreaterThan(svg.indexOf(`stroke="${SHADES.halo}"`));
  });

  // Les teintes viennent des tokens que la scène lit : une teinte illisible, et la croix tient la place de l'image
  it("falls back to the crosshair when a color of the tokens cannot be read", () => {
    for (const kind of TOOLS) {
      expect(toolCursor(kind, { ink: "", halo: "#ffffff" }), kind).toBe("crosshair");
      expect(toolCursor(kind, { ink: "#10121c", halo: "" }), kind).toBe("crosshair");
    }
  });

  // Le point chaud est au bout de l'outil, dans l'image : en bas à gauche pour chacun des trois
  it("puts the hotspot on the tip of the tool, at the bottom left of the image", () => {
    for (const kind of TOOLS) {
      const [x, y] = (toolCursor(kind, SHADES).match(/\) (\d+) (\d+),/) ?? []).slice(1).map(Number);

      expect(x, kind).toBeGreaterThanOrEqual(0);
      expect(x, kind).toBeLessThan(16);
      expect(y, kind).toBeGreaterThan(16);
      expect(y, kind).toBeLessThanOrEqual(32);
    }
  });
});
