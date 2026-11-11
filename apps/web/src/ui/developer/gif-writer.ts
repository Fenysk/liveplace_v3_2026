// Un encodeur GIF89a (JOURNAL 2026-11-11) : palette globale, images posées à une position (un rectangle seul, le reste du dessin
// restant dessous), un index transparent, boucle infinie. `gifenc` n'écrit qu'à l'origine, d'où cet encodeur : voir le JOURNAL.

export type Rgb = readonly [red: number, green: number, blue: number];

// Une image : `indexes` en couvre `width` × `height` pixels, ligne après ligne, posés à (`left`, `top`). `delayCs` : centièmes de seconde.
export type GifFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  indexes: Uint8Array;
  delayCs: number;
};

export type GifOptions = {
  width: number;
  height: number;
  palette: readonly Rgb[]; // 256 couleurs au plus
  transparentIndex?: number; // la couleur que le navigateur ne peint pas : le dessous reste visible
};

const MAX_CODE_COUNT = 4096; // la table de codes d'un GIF tient sur 12 bits
const MAX_SUBBLOCK = 255;
const EXTENSION = 0x21;
const IMAGE_SEPARATOR = 0x2c;
const TRAILER = 0x3b;
const DISPOSAL_KEEP = 1; // « ne pas effacer » : l'image suivante se pose sur celle-ci

// Un tampon d'octets qui grandit.
const createSink = () => {
  let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(1 << 16);
  let length = 0;
  const reserve = (more: number): void => {
    if (length + more <= bytes.length) return;
    const wider = new Uint8Array(Math.max(bytes.length * 2, length + more));
    wider.set(bytes.subarray(0, length));
    bytes = wider;
  };
  const byte = (value: number): void => {
    reserve(1);
    bytes[length++] = value;
  };
  return {
    byte,
    word(value: number): void {
      byte(value & 0xff);
      byte(value >> 8);
    },
    text(value: string): void {
      for (const char of value) byte(char.charCodeAt(0));
    },
    bytes(values: Uint8Array): void {
      reserve(values.length);
      bytes.set(values, length);
      length += values.length;
    },
    result: (): Uint8Array<ArrayBuffer> => bytes.slice(0, length),
  };
};

type Sink = ReturnType<typeof createSink>;

// Des codes de largeur variable, du poids faible au poids fort, par sous-blocs de 255 octets.
const createCodeWriter = (out: Sink) => {
  let pending = 0;
  let pendingBits = 0;
  const subblock: number[] = [];
  const flushSubblock = (): void => {
    out.byte(subblock.length);
    for (const value of subblock) out.byte(value);
    subblock.length = 0;
  };
  return {
    emit(code: number, size: number): void {
      pending |= code << pendingBits;
      pendingBits += size;
      while (pendingBits >= 8) {
        subblock.push(pending & 0xff);
        if (subblock.length === MAX_SUBBLOCK) flushSubblock();
        pending >>= 8;
        pendingBits -= 8;
      }
    },
    // Les bits qui restent, puis le bloc vide qui ferme l'image.
    finish(): void {
      if (pendingBits > 0) subblock.push(pending & 0xff);
      if (subblock.length > 0) flushSubblock();
      out.byte(0);
    },
  };
};

// Les `indexes` en octets LZW de GIF : codes de largeur variable, table vidée quand elle est pleine.
export function compressIndexes(indexes: Uint8Array, minCodeSize: number): Uint8Array<ArrayBuffer> {
  const out = createSink();
  const codes = createCodeWriter(out);
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let table = new Map<number, number>();
  // Une séquence de plus à connaître, ou la table vidée si elle est pleine.
  const learn = (key: number): void => {
    if (nextCode === MAX_CODE_COUNT) {
      codes.emit(clearCode, codeSize);
      [table, nextCode, codeSize] = [new Map(), endCode + 1, minCodeSize + 1];
      return;
    }
    // Le décodeur ajoute son entrée un code plus tard que nous : la largeur croît avant le premier code qui ne tiendrait plus.
    if (nextCode >= 1 << codeSize) codeSize++;
    table.set(key, nextCode++);
  };

  out.byte(minCodeSize);
  codes.emit(clearCode, codeSize);
  let prefix = indexes[0] ?? 0;
  for (let at = 1; at < indexes.length; at++) {
    const next = indexes[at] ?? 0;
    const key = prefix * 256 + next;
    const known = table.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    codes.emit(prefix, codeSize);
    learn(key);
    prefix = next;
  }
  codes.emit(prefix, codeSize);
  codes.emit(endCode, codeSize);
  codes.finish();
  return out.result();
}

const bitsFor = (colorCount: number): number => Math.max(1, Math.ceil(Math.log2(colorCount)));

export function createGifWriter({ width, height, palette, transparentIndex }: GifOptions) {
  const bits = bitsFor(palette.length);
  const out = createSink();
  out.text("GIF89a");
  out.word(width);
  out.word(height);
  out.byte(0x80 | 0x70 | (bits - 1)); // table globale, 8 bits par couleur, 2^bits couleurs
  out.byte(0); // le fond : l'index 0
  out.byte(0); // pixels carrés
  for (let index = 0; index < 1 << bits; index++)
    for (const channel of palette[index] ?? [0, 0, 0]) out.byte(channel);
  // La boucle infinie : l'extension de Netscape, `0` répétition = sans fin.
  out.byte(EXTENSION);
  out.byte(0xff);
  out.byte(11);
  out.text("NETSCAPE2.0");
  out.byte(3);
  out.byte(1);
  out.word(0);
  out.byte(0);
  let frameCount = 0;

  return {
    addFrame({ left, top, width: frameWidth, height: frameHeight, indexes, delayCs }: GifFrame): void {
      out.byte(EXTENSION);
      out.byte(0xf9);
      out.byte(4);
      out.byte((DISPOSAL_KEEP << 2) | (transparentIndex === undefined ? 0 : 1));
      out.word(Math.min(delayCs, 0xffff));
      out.byte(transparentIndex ?? 0);
      out.byte(0);
      out.byte(IMAGE_SEPARATOR);
      out.word(left);
      out.word(top);
      out.word(frameWidth);
      out.word(frameHeight);
      out.byte(0); // pas de table locale, pas d'entrelacement
      out.bytes(compressIndexes(indexes, Math.max(2, bits)));
      frameCount++;
    },
    frameCount: (): number => frameCount,
    finish(): Uint8Array<ArrayBuffer> {
      out.byte(TRAILER);
      return out.result();
    },
  };
}
