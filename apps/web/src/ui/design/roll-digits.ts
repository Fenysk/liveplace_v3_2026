// Les chiffres qui défilent quand un nombre change : ce fichier dit lesquels bougent, et comment.

export type Direction = "up" | "down";

// `fromRight` : le rang du chiffre en partant de la droite (0 = les unités) ; `from` : ce qu'il montrait, absent s'il vient d'apparaître.
export type Roll = { fromRight: number; from: string | undefined; direction: Direction };

// Un nombre découpé pour l'écran : les mots sans chiffre restent du texte, les autres sont des nombres dont chaque chiffre a son rang.
export type Piece =
  | { key: string; kind: "text"; text: string }
  | { key: string; kind: "digit"; digit: string; fromRight: number };
export type Part =
  | { key: string; kind: "text"; text: string }
  | { key: string; kind: "number"; pieces: Piece[] };

export type RollMotion = { duration: number; easing: string };

// Où en est un chiffre, tel que le navigateur l'affiche.
export type Look = { transform: string; opacity: string };

export type Playing = { cancel: () => void; finished: Promise<unknown> };

// Un chiffre à l'écran : il s'anime, se lit en cours de route, et s'efface de la page.
export type Glyph = {
  animate: (keyframes: Keyframe[], motion: RollMotion) => Playing;
  running: () => readonly Playing[];
  look: () => Look;
  remove: () => void;
};

// Le cadran d'un rang : le chiffre affiché, et celui qui s'en va par-dessus tant qu'il défile.
export type Dial = {
  shown: Glyph;
  leaving: () => Glyph | undefined;
  leave: (digit: string) => Glyph;
};

const DIGIT = /[0-9]/;
const DIGITS = /[0-9]/g;
// Un mot, entre espaces ordinaires, qui porte au moins un chiffre : « 1 234 » avec son espace insécable, « 62 % », « 4,5 Mo ».
const NUMBER_WORD = /[^ ]*[0-9][^ ]*/g;
// Un chiffre seul, ou une suite de caractères qui n'en est pas un.
const DIGIT_OR_TEXT = /[0-9]|[^0-9]+/g;

const digitsOf = (text: string): string[] => text.match(DIGITS) ?? [];

// Les chiffres de chaque côté, à égalité de longueur : lus de gauche à droite, le premier qui diffère dit le sens.
function directionOf(before: readonly string[], after: readonly string[]): Direction | undefined {
  const width = Math.max(before.length, after.length);
  const was = before.join("").padStart(width, "0");
  const now = after.join("").padStart(width, "0");
  if (was === now) return undefined;
  return now > was ? "up" : "down";
}

// Les chiffres sont alignés par la droite, sur l'ensemble du texte : seuls ceux qui diffèrent défilent, tous dans le sens du nombre.
export function planRolls(previous: string, next: string): Roll[] {
  const before = digitsOf(previous);
  const after = digitsOf(next);
  const direction = directionOf(before, after);
  if (direction === undefined) return [];
  return after.flatMap((digit, index) => {
    const fromRight = after.length - 1 - index;
    const from = before[before.length - 1 - fromRight];
    return from === digit ? [] : [{ fromRight, from, direction }];
  });
}

// Les pièces d'un mot-nombre : ses chiffres, un à un, et le texte qui les sépare ou les suit.
function piecesOf(word: string, firstDigit: number, totalDigits: number): Piece[] {
  const pieces: Piece[] = [];
  let digitIndex = firstDigit;
  let offset = 0;
  for (const run of word.match(DIGIT_OR_TEXT) ?? []) {
    if (DIGIT.test(run)) {
      const fromRight = totalDigits - 1 - digitIndex;
      pieces.push({ key: `d${fromRight}`, kind: "digit", digit: run, fromRight });
      digitIndex += 1;
    } else pieces.push({ key: `t${offset}`, kind: "text", text: run });
    offset += run.length;
  }
  return pieces;
}

// Les clés suivent l'ordre des parties, pas leur place dans le texte : un nombre qui s'allonge ne refait pas ceux d'après.
export function toParts(value: string): Part[] {
  const totalDigits = digitsOf(value).length;
  const parts: Part[] = [];
  let end = 0;
  let digitsSeen = 0;
  for (const { 0: word, index } of value.matchAll(NUMBER_WORD)) {
    if (index > end) parts.push({ key: `x${parts.length}`, kind: "text", text: value.slice(end, index) });
    parts.push({ key: `n${parts.length}`, kind: "number", pieces: piecesOf(word, digitsSeen, totalDigits) });
    digitsSeen += digitsOf(word).length;
    end = index + word.length;
  }
  if (end < value.length) parts.push({ key: `x${parts.length}`, kind: "text", text: value.slice(end) });
  return parts;
}

const AT_REST: Look = { transform: "none", opacity: "1" };

// Le nombre monte : le chiffre qui arrive vient d'en bas, celui qui part sort par le haut. Il descend : tout se renverse.
const OUTSIDE: Record<Direction, { entering: string; leaving: string }> = {
  up: { entering: "translateY(100%)", leaving: "translateY(-100%)" },
  down: { entering: "translateY(-100%)", leaving: "translateY(100%)" },
};

// Les valeurs sont concrètes, jamais des `var()` : Chrome ne confie pas au compositeur une animation qui en porte dans ses images clés.
const arrivingKeyframes = (direction: Direction): Keyframe[] => [
  { transform: OUTSIDE[direction].entering, opacity: 0 },
  { transform: "none", opacity: 1 },
];

const leavingKeyframes = (direction: Direction, from: Look): Keyframe[] => [
  { transform: from.transform, opacity: from.opacity },
  { transform: OUTSIDE[direction].leaving, opacity: 0 },
];

// Un chiffre change : l'ancien sort en fondu, le nouveau arrive en fondu. Si un défilement est en cours, le chiffre qui arrivait
// devient celui qui part, de là où il en est, et celui qui partait déjà s'efface : jamais plus d'un chiffre qui s'en va.
export function rollDial(dial: Dial, { from, direction }: Roll, motion: RollMotion): void {
  const arriving = dial.shown.running();
  const start = arriving.length > 0 ? dial.shown.look() : AT_REST;
  dial.leaving()?.remove();
  for (const playing of arriving) playing.cancel();
  if (from !== undefined) {
    const leaving = dial.leave(from);
    const clear = () => leaving.remove();
    leaving.animate(leavingKeyframes(direction, start), motion).finished.then(clear, clear);
  }
  dial.shown.animate(arrivingKeyframes(direction), motion);
}
