// Le curseur de la fresque à la souris, Écart §9.3 (JOURNAL 2026-10-13) : il dit ce que fera le clic, et un outil a l'icône
// de son bouton. La croix pour inspecter ou colorer, la loupe quand le clic zoome, la main fermée pendant un déplacement,
// puis la gomme, la pipette et le pinceau du Tracé. Sans DOM : la scène applique la valeur CSS par le CSSOM (la CSP de prod
// bloque un attribut `style` rendu par le serveur, pas un `style.cursor` posé par le navigateur).

import type { DraftMode } from "../../state/draft-store";

// Ce qui décide du curseur. `willZoom` : en Vue, un clic sur cette case zoomerait au lieu d'inspecter.
export type CursorSituation = {
  mode: DraftMode;
  isEraser: boolean;
  isPicking: boolean;
  isTracing: boolean;
  isPanning: boolean;
  willZoom: boolean;
};

export type CursorKind = "inspect" | "zoom" | "grabbing" | "draw" | "eraser" | "picker" | "trace";

// Le déplacement d'abord : il l'emporte sur tout outil. En Dessin, la pipette armée, puis le tracé (Espace maintenu : il
// pose avec la couleur ou la gomme du moment, mais le geste est le Tracé), puis la gomme.
export function cursorKind({
  mode,
  isEraser,
  isPicking,
  isTracing,
  isPanning,
  willZoom,
}: CursorSituation): CursorKind {
  if (isPanning) return "grabbing";
  if (mode === "view") return willZoom ? "zoom" : "inspect";
  if (isPicking) return "picker";
  if (isTracing) return "trace";
  return isEraser ? "eraser" : "draw";
}

type NativeKind = Extract<CursorKind, "inspect" | "zoom" | "grabbing" | "draw">;
type ToolKind = Exclude<CursorKind, NativeKind>;

const NATIVE_CURSORS: Record<NativeKind, string> = {
  inspect: "crosshair",
  zoom: "zoom-in",
  grabbing: "grabbing",
  draw: "crosshair",
};

// Le tracé des icônes Lucide de `ui/draft/draft-pill.tsx` et `ui/design/palette.tsx` (24 × 24), et le point chaud : le bout
// de l'outil, là où la case est visée. Un test les compare aux icônes des boutons.
export type ToolIcon = { paths: readonly string[]; hotspot: { x: number; y: number } };

export const TOOL_ICONS: Record<ToolKind, ToolIcon> = {
  eraser: {
    paths: [
      "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",
      "m5.082 11.09 8.828 8.828",
    ],
    hotspot: { x: 5, y: 19 },
  },
  picker: {
    paths: [
      "m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12",
      "m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z",
      "m2 22 .414-.414",
    ],
    hotspot: { x: 2, y: 22 },
  },
  trace: {
    paths: [
      "m11 10 3 3",
      "M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z",
      "M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",
    ],
    hotspot: { x: 3, y: 20 },
  },
};

// Un trait sombre cerné d'un trait clair : lisible sur un fond clair comme sur un fond foncé. Une image `data:` ne lit pas les
// variables de la page : les deux teintes se donnent, celles de tokens.css (`--draft-outline-out` et `--draft-outline-in`,
// les mêmes en clair et en sombre), que la scène lit déjà.
export type CursorShades = { ink: string; halo: string };

// Le dessin déborde de 2 unités de chaque côté pour que le contour clair ne soit pas rogné : 28 unités rendues en 32 px.
const PADDING = 2;
const VIEW_UNITS = 24 + 2 * PADDING;
const CURSOR_PX = 32;

const strokes = (paths: readonly string[], color: string, width: number): string =>
  `<g stroke="${color}" stroke-width="${width}">${paths.map((path) => `<path d="${path}"/>`).join("")}</g>`;

export const toolCursorSvg = ({ paths }: ToolIcon, { ink, halo }: CursorShades): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_PX}" height="${CURSOR_PX}" viewBox="${-PADDING} ${-PADDING} ${VIEW_UNITS} ${VIEW_UNITS}" fill="none" stroke-linecap="round" stroke-linejoin="round">${strokes(paths, halo, 5)}${strokes(paths, ink, 2)}</svg>`;

// Le point chaud, en pixels de l'image du curseur.
const toPixel = (unit: number): number => Math.round(((unit + PADDING) * CURSOR_PX) / VIEW_UNITS);

// La valeur CSS d'un outil : l'image en `data:` (la CSP de prod l'autorise, `img-src 'self' data:`), puis la croix si le
// navigateur ne sait pas l'afficher. Construite une fois par outil et par couple de teintes ; sans teinte lisible, la croix.
const toolCursors = new Map<string, string>();

export const toolCursor = (kind: ToolKind, shades: CursorShades): string => {
  if (!shades.ink || !shades.halo) return NATIVE_CURSORS.draw;
  const key = `${kind}|${shades.ink}|${shades.halo}`;
  const known = toolCursors.get(key);
  if (known) return known;
  const icon = TOOL_ICONS[kind];
  const image = `url("data:image/svg+xml,${encodeURIComponent(toolCursorSvg(icon, shades))}")`;
  const cursor = `${image} ${toPixel(icon.hotspot.x)} ${toPixel(icon.hotspot.y)}, ${NATIVE_CURSORS.draw}`;
  toolCursors.set(key, cursor);
  return cursor;
};

export const cursorOf = (kind: CursorKind, shades: CursorShades): string =>
  kind === "eraser" || kind === "picker" || kind === "trace"
    ? toolCursor(kind, shades)
    : NATIVE_CURSORS[kind];

export const canvasCursor = (situation: CursorSituation, shades: CursorShades): string =>
  cursorOf(cursorKind(situation), shades);
