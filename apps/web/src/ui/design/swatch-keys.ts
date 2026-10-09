// Le clavier de la palette du Dessin (JOURNAL 2026-10-09) : WAI-ARIA « radio group », tabindex itinérant.
// Pur : la palette lui donne la touche et la case du focus, il dit où le focus va et ce que la touche décide.

export type SwatchPress = { key: string; code: string; hasModifier: boolean };

// `move` mène le focus et choisit la couleur ; `choose` et `leave` rendent le focus au canvas, `choose` après avoir choisi.
export type SwatchKeyResult = { kind: "move"; index: number } | { kind: "choose" } | { kind: "leave" };

// Les colonnes de la grille, comme palette.css les pose : à la souris, et au doigt.
export const SWATCH_COLUMNS = { pointer: 15, touch: 6 } as const;

// Le Dessin reconnaît la palette à ce marqueur (use-draft-keys.ts) pour lui laisser ses touches.
export const PALETTE_SELECTOR = "[data-palette]";

type Move = (index: number, count: number, columns: number) => number;

// Haut et bas restent dans la colonne et bouclent. La dernière rangée peut être plus courte : le bas d'une colonne est
// sa dernière case, pas la dernière rangée.
const columnBottom: Move = (index, count, columns) => {
  const top = index % columns;
  return top + columns * Math.floor((count - 1 - top) / columns);
};

const MOVES = new Map<string, Move>([
  ["ArrowRight", (index, count) => (index + 1) % count],
  ["ArrowLeft", (index, count) => (index - 1 + count) % count],
  ["ArrowDown", (index, count, columns) => (index + columns < count ? index + columns : index % columns)],
  [
    "ArrowUp",
    (index, count, columns) => (index >= columns ? index - columns : columnBottom(index, count, columns)),
  ],
  ["Home", () => 0],
  ["End", (_index, count) => count - 1],
]);

const isSpace = (press: SwatchPress): boolean => press.code === "Space";

// Tant que le focus est dans la palette, ces touches sont à elle : le Dessin ne les entend pas. Ctrl, Alt ou Cmd : au navigateur.
export function isSwatchKey(press: SwatchPress): boolean {
  if (press.hasModifier) return false;
  return isSpace(press) || press.key === "Enter" || press.key === "Escape" || MOVES.has(press.key);
}

export function swatchKey(
  press: SwatchPress,
  index: number,
  count: number,
  columns: number,
): SwatchKeyResult | null {
  if (!isSwatchKey(press) || index < 0 || index >= count) return null;
  if (isSpace(press) || press.key === "Enter") return { kind: "choose" };
  if (press.key === "Escape") return { kind: "leave" };
  const move = MOVES.get(press.key);
  return move ? { kind: "move", index: move(index, count, columns) } : null;
}
