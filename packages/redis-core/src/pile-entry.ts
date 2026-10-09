// §5.1 : une entrée de pile `hist:`, `<userId>:<colorIndex>:<placedAt>:<version>`, puis `:<placementId>` depuis le
// protocole 6. Lue par la fin, comme dans pile.lua.

import type { PileEntry } from "@liveplace/domain/snapshot";

const PILE_ENTRY = /^(.*):(\d+):(\d+):(\d+)(?::([A-Za-z][A-Za-z0-9]*))?$/;

export function parsePileEntry(entry: string): PileEntry {
  const [, authorId, colorIndex, placedAt, version, placementId] = PILE_ENTRY.exec(entry) ?? [];
  if (authorId === undefined || colorIndex === undefined || placedAt === undefined || version === undefined)
    throw new Error(`entrée d'historique illisible (${entry})`);
  return {
    authorId,
    colorIndex: Number(colorIndex),
    placedAt: Number(placedAt),
    version: Number(version),
    ...(placementId === undefined ? {} : { placementId }),
  };
}

// L'inverse : l'entrée d'une pile telle que place.lua l'écrit.
export function formatPileEntry({ authorId, colorIndex, placedAt, version, placementId }: PileEntry): string {
  const entry = `${authorId}:${colorIndex}:${placedAt}:${version}`;
  return placementId === undefined ? entry : `${entry}:${placementId}`;
}
