// Les pixel arts des vignettes : de petits motifs génériques, que l'on reconnaît comme sur une vraie fresque de stream (un champignon,
// une épée, un fantôme, un petit extraterrestre, une étoile, une couronne, une tête de chat, une potion, un cœur, un smiley…). Ils
// restent petits, 5 à 9 cases de côté, dans les couleurs de la palette du jeu. Chaque motif est dessiné en lettres : une lettre =
// une couleur de la palette (LEGEND), un point = une case vide. Jamais un personnage protégé ni un logo, seulement des formes courantes.

export type Cell = readonly [x: number, y: number];

// Une case posée : sa position sur la fresque et l'index de sa couleur dans la palette de `domain`.
export type PixelCell = { x: number; y: number; colorIndex: number };

const LEGEND: ReadonlyMap<string, number> = new Map([
  ["R", 5], // rouge
  ["O", 8], // orange
  ["Y", 9], // ambre
  ["L", 16], // jaune pâle
  ["W", 42], // blanc
  ["K", 1], // presque noir
  ["G", 20], // vert
  ["b", 27], // bleu sombre
  ["B", 28], // bleu
  ["C", 29], // cyan
  ["P", 36], // rose
  ["V", 32], // violet clair
  ["N", 11], // brun
  ["n", 13], // sable
  ["S", 33], // gris clair
]);

const MOTIF_ROWS = {
  mushroom: [".RRRRR.", "RWWRRWR", "RWWRRRR", "RRRWWRR", ".nnnnn.", "..nLn..", "..nLn.."],
  sword: ["..S..", ".SWS.", ".SWS.", ".SWS.", ".SWS.", ".SWS.", "YYYYY", "..N..", "..Y.."],
  ghost: ["..VVV..", ".VVVVV.", "VVVVVVV", "VWKVWKV", "VWWVWWV", "VVVVVVV", "VVVVVVV", "V.V.V.V"],
  alien: ["G.....G", ".G...G.", ".GGGGG.", "GGGGGGG", "GKKGKKG", "GGGGGGG", ".GGKGG.", "..GGG.."],
  star: ["...Y...", "..YLY..", "YYYLYYY", ".YLLLY.", "..YLY..", ".YY.YY.", ".Y...Y."],
  smallStar: ["..Y..", ".YLY.", "YYLYY", ".YLY.", ".Y.Y."],
  crown: ["Y...Y...Y", "YY.YYY.YY", "YYYYYYYYY", "YRYYBYYRY", "YYYYYYYYY", "nnnnnnnnn"],
  cat: ["O.....O", "OO...OO", "OOOOOOO", "OKOOOKO", "OOOPOOO", ".OOOOO."],
  potion: [".NNN.", "..S..", ".SGS.", "SGGGS", "SGWGS", "SGGGS", ".SSS."],
  heart: [".R.R.", "RWRRR", "RRRRR", ".RRR.", "..R.."],
  smiley: ["..YYY..", ".YYYYY.", "YYKYKYY", "YYYYYYY", "YKYYYKY", ".YKKKY.", "..YYY.."],
  gem: [".bbbbb.", "bCWCCCb", ".bCCCb.", "..bCb..", "...b..."],
  coin: [".nnn.", "nYLYn", "nYLYn", "nYLYn", ".nnn."],
  bomb: ["....YO.", "....N..", ".KKKKK.", "KKKKKKK", "KWKKKKK", "KKKKKKK", ".KKKKK."],
  chest: [".NNNNNNN.", "NnnnnnnnN", "NnnnYnnnN", "NNNNYNNNN", "NnnnnnnnN", "NnnnnnnnN", "NNNNNNNNN"],
  skull: [".SSSSS.", "SSSSSSS", "SKKSKKS", "SKKSKKS", "SSSKSSS", ".SSSSS.", ".S.S.S."],
  rocket: ["..R..", ".RRR.", ".SSS.", ".SCS.", ".SSS.", "RSSSR", "R.Y.R", "..O.."],
  pizza: ["nnnnnnn", "YRYYYRY", ".YYYYY.", ".YYRYY.", "..YYY..", "..YRY..", "...Y..."],
} as const satisfies Record<string, readonly string[]>;

export type MotifName = keyof typeof MOTIF_ROWS;

export const MOTIF_NAMES = Object.keys(MOTIF_ROWS) as MotifName[];

export const motifSize = (name: MotifName): { width: number; height: number } => ({
  width: Math.max(...MOTIF_ROWS[name].map((row) => row.length)),
  height: MOTIF_ROWS[name].length,
});

// Les cases d'un motif posé à (x, y), rangée après rangée, de haut en bas : l'ordre dans lequel on le voit se dessiner.
export const motifCells = (name: MotifName, left: number, top: number): PixelCell[] =>
  MOTIF_ROWS[name].flatMap((row, y) =>
    [...row].flatMap((letter, x): PixelCell[] => {
      const colorIndex = LEGEND.get(letter);
      return colorIndex === undefined ? [] : [{ x: left + x, y: top + y, colorIndex }];
    }),
  );

// Les lettres d'un motif que la légende ne connaît pas : un test les refuse.
export const unknownLetters = (name: MotifName): string[] =>
  MOTIF_ROWS[name].flatMap((row) => [...row].filter((letter) => letter !== "." && !LEGEND.has(letter)));

export type Placement = { motif: MotifName; x: number; y: number };

// La mini-fresque de l'archivage : 24 × 16 cases, trois motifs, du blanc autour. Le motif de gauche est étroit (5 cases) : de l'escalier,
// on voit la bande de gauche (6 cases) des fresques de derrière, et il s'y lit en entier.
export const ARCHIVE_WIDTH = 24;
export const ARCHIVE_HEIGHT = 16;

export const ARCHIVE_COMPOSITIONS: readonly (readonly Placement[])[] = [
  [
    { motif: "sword", x: 1, y: 3 },
    { motif: "mushroom", x: 8, y: 2 },
    { motif: "smiley", x: 16, y: 6 },
  ],
  [
    { motif: "rocket", x: 1, y: 4 },
    { motif: "ghost", x: 8, y: 5 },
    { motif: "gem", x: 16, y: 2 },
  ],
  [
    { motif: "coin", x: 1, y: 5 },
    { motif: "alien", x: 8, y: 2 },
    { motif: "cat", x: 16, y: 7 },
  ],
  [
    { motif: "heart", x: 1, y: 5 },
    { motif: "chest", x: 8, y: 8 },
    { motif: "gem", x: 16, y: 2 },
  ],
  [
    { motif: "smallStar", x: 1, y: 5 },
    { motif: "skull", x: 8, y: 1 },
    { motif: "crown", x: 14, y: 9 },
  ],
  [
    { motif: "potion", x: 1, y: 4 },
    { motif: "pizza", x: 8, y: 2 },
    { motif: "bomb", x: 16, y: 7 },
  ],
];

// La fresque qui grandit : 34 × 22 cases, un motif entier à chaque étape, au centre d'abord puis de plus en plus loin.
export const GROWTH_WIDTH = 34;
export const GROWTH_HEIGHT = 22;

export const GROWTH_PLACEMENTS: readonly Placement[] = [
  { motif: "mushroom", x: 14, y: 8 },
  { motif: "star", x: 24, y: 3 },
  { motif: "ghost", x: 5, y: 11 },
  { motif: "crown", x: 22, y: 13 },
  { motif: "cat", x: 5, y: 4 },
];

export const placementsCells = (placements: readonly Placement[]): PixelCell[] =>
  placements.flatMap(({ motif, x, y }) => motifCells(motif, x, y));
