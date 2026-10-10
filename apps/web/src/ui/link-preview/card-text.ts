// Écart §9.1 (JOURNAL 2026-10-10) : ce que la police de l'image d'aperçu sait écrire. Satori n'a que Nunito latin : un glyphe
// qui manque y serait un carré vide. Les plages sont celles que Fontsource donne à son sous-ensemble latin (unicode.json),
// sans les caractères de contrôle.

import type { CanvasOwner } from "../../usecase/resolve-canvas";

const COVERED_RANGES: readonly (readonly [first: number, last: number])[] = [
  [0x20, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2bb, 0x2bc],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x304, 0x304],
  [0x308, 0x308],
  [0x329, 0x329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

const isCovered = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return COVERED_RANGES.some(([first, last]) => code >= first && code <= last);
};

// Le pseudo affiché, ou le login (de l'ASCII) quand la police ne couvre pas le premier.
export const cardName = ({ displayName, login }: Pick<CanvasOwner, "displayName" | "login">): string =>
  Array.from(displayName).every(isCovered) ? displayName : login;

// Le thème est un texte libre, emoji compris : ce que la police ne couvre pas s'efface, et un thème qui n'a plus rien
// à dire n'est pas écrit.
export const cardTheme = (theme: string | undefined): string | undefined => {
  const covered = Array.from(theme ?? "")
    .filter(isCovered)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return covered === "" ? undefined : covered;
};
