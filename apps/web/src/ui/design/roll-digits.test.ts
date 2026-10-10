import { describe, expect, it } from "vitest";
import {
  type Dial,
  type Glyph,
  type Look,
  type Part,
  type Playing,
  planRolls,
  type RollMotion,
  rollDial,
  toParts,
} from "./roll-digits";

// Les chiffres qui défilent : seuls ceux qui changent bougent, vers le haut quand le nombre monte.

const NARROW_SPACE = " "; // le séparateur de milliers de `toLocaleString("fr-FR")`

describe("planRolls : quels chiffres défilent", () => {
  // Les chiffres qui ne changent pas restent immobiles
  it("rolls only the digits that differ, up when the number rises", () => {
    expect(planRolls(`1${NARROW_SPACE}234`, `1${NARROW_SPACE}235`)).toEqual([
      { fromRight: 0, from: "4", direction: "up" },
    ]);
  });

  // Il descend : les chiffres défilent vers le bas
  it("rolls down when the number falls", () => {
    expect(planRolls("62 %", "58 %")).toEqual([
      { fromRight: 1, from: "6", direction: "down" },
      { fromRight: 0, from: "2", direction: "down" },
    ]);
  });

  // Une retenue change deux chiffres, et les deux montent : 9 devient 0 en montant aussi
  it("lets a carry roll both digits the same way", () => {
    expect(planRolls("1 239", "1 240")).toEqual([
      { fromRight: 1, from: "3", direction: "up" },
      { fromRight: 0, from: "9", direction: "up" },
    ]);
  });

  // Un chiffre de plus : les autres défilent, et le nouveau arrive sans rien avoir montré avant
  it("brings a new leading digit in, with nothing to roll out", () => {
    expect(planRolls("999", `1${NARROW_SPACE}000`)).toEqual([
      { fromRight: 3, from: undefined, direction: "up" },
      { fromRight: 2, from: "9", direction: "up" },
      { fromRight: 1, from: "9", direction: "up" },
      { fromRight: 0, from: "9", direction: "up" },
    ]);
  });

  // Un chiffre de moins : celui qui disparaît n'a plus de case, les autres descendent
  it("rolls the digits left when the number loses one", () => {
    expect(planRolls(`1${NARROW_SPACE}000`, "999")).toEqual([
      { fromRight: 2, from: "0", direction: "down" },
      { fromRight: 1, from: "0", direction: "down" },
      { fromRight: 0, from: "0", direction: "down" },
    ]);
  });

  // Les minutes et les secondes se lisent en chiffres alignés par la droite : seule la seconde bouge
  it("lines the digits up from the right across several numbers", () => {
    expect(planRolls("4 min 30 s", "4 min 31 s")).toEqual([{ fromRight: 0, from: "0", direction: "up" }]);
    expect(planRolls("9 min 59 s", "10 min 00 s").map(({ fromRight }) => fromRight)).toEqual([3, 2, 1, 0]);
  });

  // Le pluriel change avec le nombre : seul le chiffre défile, les mots passent d'un coup
  it("rolls the digit and leaves the words to change at once", () => {
    expect(planRolls("1 pixel", "2 pixels")).toEqual([{ fromRight: 0, from: "1", direction: "up" }]);
  });

  // Rien ne défile quand les chiffres sont les mêmes, ou quand il n'y en a plus
  it("rolls nothing when the digits are the same or gone", () => {
    expect(planRolls("12 px/h", "12 px/h")).toEqual([]);
    expect(planRolls("12 pixels", "12 px")).toEqual([]);
    expect(planRolls("5 min", "—")).toEqual([]);
  });

  // Un tiret devient un nombre : ses chiffres arrivent
  it("brings the digits in when a dash becomes a number", () => {
    expect(planRolls("—", "5 min")).toEqual([{ fromRight: 0, from: undefined, direction: "up" }]);
  });
});

const digitsOf = (parts: readonly Part[]): string[] =>
  parts.flatMap((part) =>
    part.kind === "number"
      ? part.pieces.flatMap((piece) => (piece.kind === "digit" ? [`${piece.digit}@${piece.fromRight}`] : []))
      : [],
  );

describe("toParts : le nombre découpé pour l'écran", () => {
  // Un mot sans chiffre reste du texte : il garde ses retours à la ligne
  it("keeps the words without digits as plain text around the numbers", () => {
    const parts = toParts("dont 3 invités");
    expect(parts.map(({ kind }) => kind)).toEqual(["text", "number", "text"]);
    expect(parts[0]).toMatchObject({ kind: "text", text: "dont " });
    expect(parts[2]).toMatchObject({ kind: "text", text: " invités" });
  });

  // Chaque chiffre porte son rang à partir de la droite, quel que soit le nombre qui le contient
  it("gives each digit its rank from the right, across every number", () => {
    expect(digitsOf(toParts(`1${NARROW_SPACE}234 pixels`))).toEqual(["1@3", "2@2", "3@1", "4@0"]);
    expect(digitsOf(toParts("4 min 30 s"))).toEqual(["4@2", "3@1", "0@0"]);
  });

  // Le séparateur, la virgule et l'unité collée au nombre restent à leur place, du texte entre les chiffres
  it("keeps the separators and the attached unit in place", () => {
    const [number] = toParts(`1${NARROW_SPACE}234,5%`);
    const pieces = number?.kind === "number" ? number.pieces : [];
    expect(pieces.map((piece) => (piece.kind === "digit" ? piece.digit : piece.text))).toEqual([
      "1",
      NARROW_SPACE,
      "2",
      "3",
      "4",
      ",",
      "5",
      "%",
    ]);
  });

  // Une clé par pièce, jamais deux fois la même : la liste suit un nombre qui s'allonge sans refaire tous ses chiffres
  it("gives every piece its own key, stable for a digit as the number grows on the left", () => {
    const keysOf = (value: string): string[] =>
      toParts(value).flatMap((part) => (part.kind === "number" ? part.pieces.map(({ key }) => key) : []));
    const short = keysOf("99");
    const long = keysOf("999");
    expect(new Set(long).size).toBe(long.length);
    for (const key of short) expect(long).toContain(key);
  });

  // Sans chiffre du tout, tout est du texte
  it("reads a dash as plain text", () => {
    expect(toParts("—")).toEqual([{ key: "x0", kind: "text", text: "—" }]);
  });
});

const MOTION: RollMotion = { duration: 340, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const AT_REST: Look = { transform: "none", opacity: "1" };

type FakeGlyph = Glyph & {
  text: string;
  keyframes: Keyframe[][];
  isRemoved: boolean;
  isCancelled: () => boolean;
  finish: () => void;
  lookNow: Look;
};

// Un chiffre dont les animations durent jusqu'à `finish` ; une animation annulée est terminée aussi, comme `Animation.finished`.
const createGlyph = (text: string): FakeGlyph => {
  const playing: (Playing & { isDone: boolean; end: () => void })[] = [];
  const glyph: FakeGlyph = {
    text,
    keyframes: [],
    isRemoved: false,
    lookNow: AT_REST,
    animate: (keyframes) => {
      glyph.keyframes.push(keyframes);
      let end: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        end = resolve;
      });
      const one = {
        isDone: false,
        finished,
        end: () => {
          one.isDone = true;
          end();
        },
        cancel: () => one.end(),
      };
      playing.push(one);
      return one;
    },
    running: () => playing.filter(({ isDone }) => !isDone),
    look: () => glyph.lookNow,
    remove: () => {
      glyph.isRemoved = true;
    },
    isCancelled: () => playing.some(({ isDone }) => isDone),
    finish: () => {
      for (const one of playing) one.end();
    },
  };
  return glyph;
};

const createDial = (shownText: string) => {
  const shown = createGlyph(shownText);
  const spawned: FakeGlyph[] = [];
  const dial: Dial = {
    shown,
    leaving: () => spawned.filter(({ isRemoved }) => !isRemoved).at(-1),
    leave: (digit) => {
      const leaving = createGlyph(digit);
      spawned.push(leaving);
      return leaving;
    },
  };
  return { dial, shown, spawned, alive: () => spawned.filter(({ isRemoved }) => !isRemoved) };
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("rollDial : un chiffre qui défile", () => {
  // Le nombre monte : l'ancien chiffre sort par le haut et se fond, le nouveau arrive du bas, pendant la durée du design system
  it("sends the old digit out the top and brings the new one in from below when the number rises", () => {
    const { dial, shown, spawned } = createDial("5");
    rollDial(dial, { fromRight: 0, from: "4", direction: "up" }, MOTION);

    expect(spawned.map(({ text }) => text)).toEqual(["4"]);
    expect(spawned[0]?.keyframes).toEqual([
      [
        { transform: "none", opacity: "1" },
        { transform: "translateY(-100%)", opacity: 0 },
      ],
    ]);
    expect(shown.keyframes).toEqual([
      [
        { transform: "translateY(100%)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
    ]);
  });

  // Il descend : tout se renverse
  it("mirrors it when the number falls", () => {
    const { dial, shown, spawned } = createDial("3");
    rollDial(dial, { fromRight: 0, from: "4", direction: "down" }, MOTION);

    expect(spawned[0]?.keyframes[0]?.at(-1)).toEqual({ transform: "translateY(100%)", opacity: 0 });
    expect(shown.keyframes[0]?.[0]).toEqual({ transform: "translateY(-100%)", opacity: 0 });
  });

  // Un chiffre qui vient d'apparaître n'a rien à faire sortir
  it("lets a digit that just appeared arrive alone", () => {
    const { dial, shown, spawned } = createDial("1");
    rollDial(dial, { fromRight: 3, from: undefined, direction: "up" }, MOTION);

    expect(spawned).toEqual([]);
    expect(shown.keyframes).toHaveLength(1);
  });

  // Le chiffre qui s'en va quitte la page une fois sorti
  it("takes the leaving digit out of the page once it has left", async () => {
    const { dial, spawned } = createDial("5");
    rollDial(dial, { fromRight: 0, from: "4", direction: "up" }, MOTION);
    expect(spawned[0]?.isRemoved).toBe(false);

    spawned[0]?.finish();
    await flush();
    expect(spawned[0]?.isRemoved).toBe(true);
  });

  // Le nombre change de nouveau en plein défilement : un seul chiffre qui s'en va, jamais deux, et le suivant repart de là où est
  // le chiffre arrivant, sans saut
  it("restarts from where the arriving digit is, never stacking a second leaving digit", () => {
    const { dial, shown, spawned, alive } = createDial("5");
    rollDial(dial, { fromRight: 0, from: "4", direction: "up" }, MOTION);
    const first = spawned[0];
    const midway: Look = { transform: "matrix(1, 0, 0, 1, 0, 14)", opacity: "0.4" };
    shown.lookNow = midway;

    rollDial(dial, { fromRight: 0, from: "5", direction: "up" }, MOTION);

    expect(first?.isRemoved).toBe(true);
    expect(alive().map(({ text }) => text)).toEqual(["5"]);
    expect(alive()[0]?.keyframes[0]?.[0]).toEqual(midway);
    expect(shown.running()).toHaveLength(1);
    expect(shown.keyframes).toHaveLength(2);
  });

  // Rien n'arrive en cours de route : le chiffre part de son repos
  it("starts the leaving digit from rest when nothing was arriving", () => {
    const { dial, spawned } = createDial("5");
    rollDial(dial, { fromRight: 0, from: "4", direction: "up" }, MOTION);
    expect(spawned[0]?.keyframes[0]?.[0]).toEqual(AT_REST);
  });
});
