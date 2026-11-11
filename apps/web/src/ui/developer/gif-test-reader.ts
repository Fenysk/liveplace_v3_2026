// Un lecteur de GIF89a pour les tests de l'encodeur (JOURNAL 2026-11-11) : l'en-tête, la palette, chaque image décompressée et posée.
// Il n'est utilisé que par les tests : il lit ce que `gif-writer.ts` écrit, rien de plus.

import type { Rgb } from "./gif-writer";

export type ParsedFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  delayCs: number;
  disposal: number;
  transparentIndex: number | null;
  indexes: Uint8Array;
};

export type ParsedGif = {
  header: string;
  width: number;
  height: number;
  palette: Rgb[];
  loops: number | null; // `0` : sans fin ; `null` : pas d'extension de boucle
  frames: ParsedFrame[];
  trailer: number; // le dernier octet
};

const MAX_CODE_SIZE = 12;
const MAX_CODE_COUNT = 1 << MAX_CODE_SIZE;
const EXTENSION = 0x21;
const IMAGE_SEPARATOR = 0x2c;
const TRAILER = 0x3b;
const CONTROL_LABEL = 0xf9;
const APPLICATION_LABEL = 0xff;

// Les codes de largeur variable d'un flux, du poids faible au poids fort.
const createCodeReader = (data: Uint8Array) => {
  let position = 0;
  let accumulator = 0;
  let bufferedBits = 0;
  return (size: number): number => {
    while (bufferedBits < size && position < data.length) {
      accumulator |= (data[position++] ?? 0) << bufferedBits;
      bufferedBits += 8;
    }
    const code = accumulator & ((1 << size) - 1);
    accumulator >>= size;
    bufferedBits -= size;
    return code;
  };
};

const widerSize = (tableLength: number, size: number): number =>
  tableLength === 1 << size && size < MAX_CODE_SIZE ? size + 1 : size;

// La table de codes : chaque entrée est un code précédent suivi d'un index, donc une séquence s'écrit de la fin vers le début.
const createCodeTable = (minCodeSize: number) => {
  const clearCode = 1 << minCodeSize;
  const prefixes = new Int32Array(MAX_CODE_COUNT);
  const suffixes = new Uint8Array(MAX_CODE_COUNT);
  const lengths = new Int32Array(MAX_CODE_COUNT);
  const firsts = new Uint8Array(MAX_CODE_COUNT);
  const table = { nextCode: clearCode + 2, codeSize: minCodeSize + 1 };
  const reset = (): void => {
    for (let code = 0; code < clearCode; code++) {
      [prefixes[code], suffixes[code], lengths[code], firsts[code]] = [-1, code, 1, code];
    }
    [table.nextCode, table.codeSize] = [clearCode + 2, minCodeSize + 1];
  };
  reset();
  return {
    table,
    reset,
    // L'entrée qui suit `previous` : sa séquence puis le premier index de `code` (ou du précédent, si `code` est cette entrée même).
    learn(previous: number, code: number): void {
      const suffix = firsts[code < table.nextCode ? code : previous] ?? 0;
      const entry = table.nextCode;
      [prefixes[entry], suffixes[entry], lengths[entry], firsts[entry]] = [
        previous,
        suffix,
        (lengths[previous] ?? 0) + 1,
        firsts[previous] ?? 0,
      ];
      table.codeSize = widerSize(++table.nextCode, table.codeSize);
    },
    lengthOf: (code: number): number => lengths[code] ?? 1,
    // Écrit la séquence de `code` à partir de `at`, sans dépasser `limit`.
    write(code: number, out: Uint8Array, at: number, limit: number): void {
      let walk = code;
      for (let offset = (lengths[code] ?? 1) - 1; offset >= 0; offset--) {
        if (at + offset < limit) out[at + offset] = suffixes[walk] ?? 0;
        walk = prefixes[walk] ?? -1;
      }
    },
  };
};

// Le flux LZW d'une image, sans son octet de taille de code : l'inverse de `compressIndexes`.
export function decompressIndexes(stream: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const codes = createCodeTable(minCodeSize);
  const read = createCodeReader(stream);
  const out = new Uint8Array(pixelCount);
  let previous = -1;
  let written = 0;
  while (written < pixelCount) {
    const code = read(codes.table.codeSize);
    if (code === clearCode + 1) break;
    if (code === clearCode) {
      codes.reset();
      previous = -1;
      continue;
    }
    if (previous >= 0) codes.learn(previous, code);
    codes.write(code, out, written, pixelCount);
    written += codes.lengthOf(code);
    previous = code;
  }
  return out;
}

// Les sous-blocs qui commencent à `start` (chacun précédé de sa taille, la fin étant un bloc vide), mis bout à bout.
const unpackSubblocks = (bytes: Uint8Array, start: number): { data: Uint8Array; end: number } => {
  const parts: number[] = [];
  let at = start;
  for (let size = bytes[at++] ?? 0; size > 0; size = bytes[at++] ?? 0) {
    parts.push(...bytes.subarray(at, at + size));
    at += size;
  }
  return { data: Uint8Array.from(parts), end: at };
};

// Ce que `compressIndexes` écrit : la taille de code, les sous-blocs, puis la fin.
export const decodeCompressed = (compressed: Uint8Array, pixelCount: number): Uint8Array =>
  decompressIndexes(unpackSubblocks(compressed, 1).data, compressed[0] ?? 2, pixelCount);

// Un curseur qui avance dans les octets : chaque lecture passe à la suite.
const createCursor = (bytes: Uint8Array) => {
  let at = 0;
  const byte = (): number => bytes[at++] ?? 0;
  const word = (): number => byte() | (byte() << 8);
  return {
    byte,
    word,
    skip(count: number): void {
      at += count;
    },
    text(length: number): string {
      const value = String.fromCharCode(...bytes.subarray(at, at + length));
      at += length;
      return value;
    },
    subblocks(): Uint8Array {
      const blocks = unpackSubblocks(bytes, at);
      at = blocks.end;
      return blocks.data;
    },
    position: (): number => at,
  };
};

type Cursor = ReturnType<typeof createCursor>;
type Control = { delayCs: number; disposal: number; transparentIndex: number | null };

const parseControl = (cursor: Cursor): Control => {
  cursor.byte(); // la taille du bloc : 4
  const flags = cursor.byte();
  const delayCs = cursor.word();
  const transparentIndex = cursor.byte();
  cursor.byte();
  return { delayCs, disposal: (flags >> 2) & 7, transparentIndex: flags & 1 ? transparentIndex : null };
};

const parseFrame = (cursor: Cursor, control: Control): ParsedFrame => {
  const [left, top, width, height] = [cursor.word(), cursor.word(), cursor.word(), cursor.word()];
  cursor.byte(); // pas de table locale, pas d'entrelacement
  const minCodeSize = cursor.byte();
  const indexes = decompressIndexes(cursor.subblocks(), minCodeSize, width * height);
  return { left, top, width, height, ...control, indexes };
};

// Une extension : la commande d'image (délai, transparence), la boucle de Netscape, ou un bloc qu'on saute.
const parseExtension = (cursor: Cursor, gif: ParsedGif, control: Control): Control => {
  const label = cursor.byte();
  if (label === CONTROL_LABEL) return parseControl(cursor);
  const isLoop = label === APPLICATION_LABEL && cursor.text(cursor.byte()) === "NETSCAPE2.0";
  const block = cursor.subblocks();
  if (isLoop) gif.loops = (block[1] ?? 0) | ((block[2] ?? 0) << 8);
  return control;
};

export function parseGif(bytes: Uint8Array): ParsedGif {
  const cursor = createCursor(bytes);
  const header = cursor.text(6);
  const [width, height] = [cursor.word(), cursor.word()];
  const packed = cursor.byte();
  cursor.skip(2); // le fond et le rapport des pixels
  const paletteLength = 1 << ((packed & 7) + 1);
  const palette = Array.from(
    { length: paletteLength },
    (): Rgb => [cursor.byte(), cursor.byte(), cursor.byte()],
  );
  const gif: ParsedGif = {
    header,
    width,
    height,
    palette,
    loops: null,
    frames: [],
    trailer: bytes.at(-1) ?? 0,
  };
  let control: Control = { delayCs: 0, disposal: 0, transparentIndex: null };
  for (let marker = cursor.byte(); marker !== TRAILER; marker = cursor.byte()) {
    if (marker === IMAGE_SEPARATOR) gif.frames.push(parseFrame(cursor, control));
    else if (marker === EXTENSION) control = parseExtension(cursor, gif, control);
    else throw new Error(`gif : octet ${marker} inattendu à ${cursor.position() - 1}`);
  }
  return gif;
}

// Ce que montre l'écran après les `count` premières images : chacune posée sur la précédente, son index transparent laissé.
export function composeGif(gif: ParsedGif, count: number): Uint8Array {
  const screen = new Uint8Array(gif.width * gif.height);
  for (const frame of gif.frames.slice(0, count))
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        const index = frame.indexes[y * frame.width + x] ?? 0;
        if (index !== frame.transparentIndex) screen[(frame.top + y) * gif.width + frame.left + x] = index;
      }
  return screen;
}
