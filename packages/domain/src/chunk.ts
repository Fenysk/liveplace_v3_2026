// L'historique d'un canvas : les entrées de son flux, rangées dans Convex par `chunk` (Écart §7.2, JOURNAL 2026-10-08).

import type { Event } from "@liveplace/protocol";
import type { Timestamp } from "./index";

export const CHUNK_SCHEMA_VERSION = 1;

// Une entrée du flux : sa version, la `placementId` de la pose (`null` pour une modération, un signalement, ou une pose
// d'avant le champ `p`), et l'événement tel que les scripts Lua l'ont écrit.
export type ChunkEntry = [version: number, placementId: string | null, event: Event];

// Le JSON d'un `payload`, une fois décompressé.
export type Chunk = {
  schemaVersion: typeof CHUNK_SCHEMA_VERSION;
  canvasId: string;
  fromVersion: number;
  toVersion: number;
  entries: ChunkEntry[];
};

// Des versions qu'aucune entrée ne porte, bornes comprises.
export type VersionGap = { from: number; to: number };

// Ce que la ligne d'index dit du fichier. `gaps` : des versions perdues (le flux a été rogné) ; `resizedAt` : la version
// sans événement d'un changement de taille ; `recoveredAt` : la date d'une récupération (étape E), jamais écrit ici.
export type ChunkIndex = {
  canvasId: string;
  fromVersion: number;
  toVersion: number;
  fromTs: Timestamp;
  toTs: Timestamp;
  count: number;
  schemaVersion: number;
  gaps?: VersionGap[];
  resizedAt?: number;
  recoveredAt?: Timestamp;
};

export type ChunkFile = ChunkIndex & { payload: Uint8Array };

export type GapNotes = Pick<ChunkIndex, "gaps" | "resizedAt">;

// La dernière récupération d'un canvas : sa date, la version où il reprend (au-dessus de sa sauvegarde et du curseur
// d'archive d'alors), et la version de la sauvegarde remise en place (Écart §7.2, JOURNAL 2026-10-08).
export type Recovered = { at: Timestamp; version: number; snapshotVersion: number };

// Le chunk que le curseur d'archive attend est le premier d'après la récupération : le curseur n'a pas passé sa reprise.
export const isFirstAfterRecovery = (cursor: number, recovered: Recovered | null): recovered is Recovered =>
  recovered !== null && recovered.version > cursor;

// Chaque version après `afterVersion` jusqu'à la dernière entrée devrait porter une entrée. Une version manquante est
// un trou, sauf la dernière taille connue : `resize.lua` prend une version sans écrire d'événement. Aucun trou : pas de champ.
export function listGaps(
  afterVersion: number,
  versions: readonly number[],
  resizedAtVersion: number | null,
): GapNotes {
  const gaps: VersionGap[] = [];
  let previous = afterVersion;
  for (const version of versions) {
    if (version > previous + 1) gaps.push({ from: previous + 1, to: version - 1 });
    previous = version;
  }
  const isResize = (gap: VersionGap): boolean => gap.from === gap.to && gap.from === resizedAtVersion;
  const lost = gaps.filter((gap) => !isResize(gap));
  return {
    ...(lost.length > 0 ? { gaps: lost } : {}),
    ...(resizedAtVersion !== null && lost.length < gaps.length ? { resizedAt: resizedAtVersion } : {}),
  };
}

// Les trous du chunk qui suit `cursor`. Le premier d'après une récupération note aussi les versions perdues avant elle : de
// celle qui suit le curseur à celle de la sauvegarde remise en place, jamais archivées. Entre la sauvegarde et la reprise, aucune
// version n'a existé, ce n'est pas un trou ; une sauvegarde au plus égale au curseur n'a rien perdu.
export function listChunkGaps(
  cursor: number,
  versions: readonly number[],
  resizedAtVersion: number | null,
  recovered: Recovered | null,
): GapNotes {
  if (!isFirstAfterRecovery(cursor, recovered)) return listGaps(cursor, versions, resizedAtVersion);
  const { gaps = [], ...notes } = listGaps(recovered.version, versions, resizedAtVersion);
  const all = [
    ...(recovered.snapshotVersion > cursor ? [{ from: cursor + 1, to: recovered.snapshotVersion }] : []),
    ...gaps,
  ];
  return { ...notes, ...(all.length > 0 ? { gaps: all } : {}) };
}
