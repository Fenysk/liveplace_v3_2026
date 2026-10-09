// Le snapshot complet d'un canvas : de quoi le rendre à son streamer après une perte totale (Écart §7.2, JOURNAL 2026-10-06).

import { type CanvasSize, CELL_STRIDE, type Timestamp, toStateOffset } from "./index";

export const SNAPSHOT_SCHEMA_VERSION = 1;

// La version d'un canvas récupéré saute de tant au-dessus de sa sauvegarde et de son curseur d'historique : aucune page ne
// croit déjà posséder ces versions, elle prend un snapshot entier (JOURNAL 2026-10-08).
export const RECOVERY_VERSION_JUMP = 1_000_000;

// Le palier d'un snapshot (§7.2) : le worker écrit `working` ; la rétention y ajoute `hourly`, `daily` et `weekly` (JOURNAL 2026-10-08).
export const SNAPSHOT_TIERS = ["working", "hourly", "daily", "weekly"] as const;
export type SnapshotTier = (typeof SNAPSHOT_TIERS)[number];

// Une entrée d'une pile `hist:` (§5.1). Sans `placementId`, c'est un pixel d'avant le protocole 6 : sa pose est sa version.
export type PileEntry = {
  authorId: string;
  colorIndex: number;
  placedAt: Timestamp;
  version: number;
  placementId?: string;
};

// Le pixel visible d'une case : sa clé, puis son auteur et sa pose par leur rang dans `authors` et `placements`
// (-1 : pas de `placementId`), sa couleur, son heure et sa version.
export type SnapshotCell = [
  cellKey: number,
  authorIndex: number,
  placementIndex: number,
  colorIndex: number,
  placedAt: Timestamp,
  version: number,
];

// Chaque champ reprend sa clé Redis (§5.1), telle quelle : `restore.lua` n'a rien à traduire. `meta` ne garde pas `ready`.
export type CanvasSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  canvasId: string;
  version: number; // lue avant tout le reste : le contenu est au moins aussi récent
  takenAt: Timestamp;
  meta: Record<string, string>;
  authors: string[];
  placements: string[];
  cells: SnapshotCell[]; // un par case dont la pile a un pixel visible, hors cadre comprises
  progress: Record<string, Record<string, string>>; // `userId` → `progress:<userId>`, champ par champ
  bans: string[];
  bansTwitch: string[];
  banProofs: Record<string, Record<string, string>>; // `userId` → `ban:<userId>`
  cleared: Record<string, string>;
  clearedPlacements: string[];
  clearedRanges: Record<string, string>; // le JSON des plages, comme Redis le garde
  mods: string[];
  modsTwitch: string[];
  modsLiveplace: string[];
  twitchUsers: Record<string, string>;
  reported: [placementKey: string, reportedAt: Timestamp][];
  reports: Record<string, string[]>; // `<auteur>:<pose>` → qui l'a signalée
  offStream: string[];
  approved: string[];
  // Facultatifs : les sauvegardes d'avant (JOURNAL 2026-10-08) n'en ont pas. `userId` → score, comme Redis le garde.
  scoreboard?: Record<string, string> | undefined;
  scoreboardBanned?: Record<string, string> | undefined;
};

// Le dessin seul d'une sauvegarde, sans ses auteurs ni sa modération : ce que gardent les paliers `weekly` et, au-delà de 7
// jours, `daily` (JOURNAL 2026-10-08). Un retour en arrière rend alors le dessin, pas ses auteurs.
export type SnapshotImage = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  canvasId: string;
  version: number;
  takenAt: Timestamp;
  width: number;
  height: number;
  state: Uint8Array;
};

export function toSnapshotImage(snapshot: CanvasSnapshot): SnapshotImage {
  const size = { width: Number(snapshot.meta.width), height: Number(snapshot.meta.height) };
  const { schemaVersion, canvasId, version, takenAt } = snapshot;
  return { schemaVersion, canvasId, version, takenAt, ...size, state: restoreState(size, snapshot.cells) };
}

// Les pierres tombales (D-16) lues dans `cleared`, `cleared:placements` et `cleared:ranges`.
export type Tombstones = {
  clearedVersions: ReadonlyMap<string, number>;
  clearedPlacements: ReadonlySet<string>;
  clearedRanges: ReadonlyMap<string, readonly (readonly [from: Timestamp, to: Timestamp])[]>;
};

// La règle de pile.lua : son auteur retiré jusqu'à une version, sa pose, ou une plage d'heures de son auteur.
export function isCovered(entry: PileEntry, placementKey: string, tombstones: Tombstones): boolean {
  const clearedVersion = tombstones.clearedVersions.get(entry.authorId);
  if (clearedVersion !== undefined && entry.version <= clearedVersion) return true;
  if (tombstones.clearedPlacements.has(placementKey)) return true;
  const ranges = tombstones.clearedRanges.get(entry.authorId) ?? [];
  return ranges.some(([from, to]) => entry.placedAt >= from && entry.placedAt <= to);
}

// Le `state` refait des cases visibles : une case hors du cadre n'y entre pas (§5.7), elle garde sa pile ailleurs.
export function restoreState({ width, height }: CanvasSize, cells: readonly SnapshotCell[]): Uint8Array {
  const state = new Uint8Array(width * height);
  for (const [cellKey, , , colorIndex] of cells) {
    const x = cellKey % CELL_STRIDE;
    const y = Math.floor(cellKey / CELL_STRIDE);
    if (x < width && y < height) state[toStateOffset(x, y, width)] = colorIndex;
  }
  return state;
}
