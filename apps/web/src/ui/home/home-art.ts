// Les dessins de la démo de l'accueil (Écart §9.1, JOURNAL 2026-10-22) : la fresque est un carré de 12 cases.

export const GRID_SIDE = 12;

// Les six couleurs de la démo, prises dans la palette de `domain` ; l'index 0 reste le transparent, comme dans le jeu.
// L'ordre est celui de la rangée du téléphone, et celui des classes `lp-home-tone-N` de home.css.
export const DEMO_COLOR = { dark: 1, red: 2, yellow: 3, green: 4, blue: 5, white: 6 } as const;

export const cellAt = (x: number, y: number): number => y * GRID_SIDE + x;

const cellsOf = (points: readonly (readonly [number, number])[]): number[] =>
  points.map(([x, y]) => cellAt(x, y));

// Un cœur déjà dessiné, en rouge : la fresque n'est jamais vide.
const HEART_ROWS = ["", "", "..XX.XX", ".XXXXXXX", ".XXXXXXX", "..XXXXX", "...XXX", "....X"];

export const HEART: readonly number[] = HEART_ROWS.flatMap((row, y) =>
  [...row].flatMap((mark, x) => (mark === "X" ? [cellAt(x, y)] : [])),
);

// Le soleil, en deux lots de quatre cases.
export const SUN: readonly (readonly number[])[] = [
  cellsOf([
    [9, 1],
    [10, 1],
    [8, 2],
    [9, 2],
  ]),
  cellsOf([
    [10, 2],
    [11, 2],
    [9, 3],
    [10, 3],
  ]),
];

// L'herbe, en deux lots de quatre cases, sur la dernière rangée.
export const GRASS: readonly (readonly number[])[] = [
  cellsOf([2, 3, 4, 5].map((x) => [x, GRID_SIDE - 1] as const)),
  cellsOf([6, 7, 8, 9].map((x) => [x, GRID_SIDE - 1] as const)),
];
