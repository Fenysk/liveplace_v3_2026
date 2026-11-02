// CDC §8, Supprimer son compte : le filtre des comptes qu'un fichier de Convex nomme (JOURNAL 2026-11-02). Un filtre de Bloom
// de quelques centaines d'octets, rangé dans la ligne du fichier : une suppression ne télécharge que les fichiers qui peuvent
// nommer le compte. Jamais de faux négatif ; un faux positif coûte une lecture, pas une erreur. Il ne garde aucun identifiant
// lisible, et il est refait à chaque réécriture du fichier : celui d'un compte supprimé n'y reste pas.

const BITS_PER_ACCOUNT = 12;
const HASH_COUNT = 8; // ln 2 × 12 bits par compte : environ 0,3 % de faux positifs
const MIN_BYTES = 32;
const MAX_BYTES = 16 * 1024; // une ligne Convex pèse 1 Mio au plus ; plein, le filtre dit « peut-être » plus souvent, jamais « non » à tort

const FNV_PRIME = 0x01000193;

// FNV-1a sur les unités de la chaîne, avec une graine : deux hachages indépendants suffisent à en tirer huit (Kirsch-Mitzenmacher).
const hashWith = (seed: number, text: string): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
};

const positionsOf = (userId: string, bitCount: number): number[] => {
  const first = hashWith(0x811c9dc5, userId);
  const step = hashWith(0x9e3779b9, userId) | 1;
  return Array.from(
    { length: HASH_COUNT },
    (_, index) => ((first + Math.imul(index, step)) >>> 0) % bitCount,
  );
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export function createAccountsFilter(userIds: Iterable<string>): string {
  const accounts = [...new Set(userIds)];
  const byteCount = Math.min(
    MAX_BYTES,
    Math.max(MIN_BYTES, Math.ceil((accounts.length * BITS_PER_ACCOUNT) / 8)),
  );
  const bytes = new Uint8Array(byteCount);
  for (const userId of accounts) {
    for (const position of positionsOf(userId, byteCount * 8)) {
      const at = position >> 3;
      bytes[at] = (bytes[at] ?? 0) | (1 << (position & 7));
    }
  }
  return toBase64(bytes);
}

// Faux : le fichier ne nomme pas ce compte. Vrai : il le nomme peut-être, il faut le lire. Un filtre illisible ne prouve rien :
// c'est « peut-être ».
export function mayNameAccount(filter: string, userId: string): boolean {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(filter);
  } catch {
    return true;
  }
  if (bytes.length === 0) return true;
  return positionsOf(userId, bytes.length * 8).every(
    (position) => ((bytes[position >> 3] ?? 0) & (1 << (position & 7))) !== 0,
  );
}
