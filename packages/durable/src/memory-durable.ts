// Convex en mémoire, pour les tests du worker et le scénario d'un compte supprimé : ses tables, ses fichiers et ses compteurs,
// avec ce que font `snapshots.ts`, `chunks.ts`, `usage.ts` et `erasures.ts` de `convex/`. Réservé aux tests (hors de
// `index.ts`), comme `redis-core/src/test-harness.ts`. `recountUsage` refait les compteurs depuis les lignes : un test exige
// qu'ils restent égaux à `usage` après n'importe quelle suite d'opérations.

import { randomUUID } from "node:crypto";
import type {
  ErasureStore,
  HistoryStore,
  OrphanStore,
  RecoveryStore,
  RestoredUser,
  RetentionStore,
  SnapshotStore,
  StoredFile,
} from "@liveplace/domain/ports";
import type { SnapshotTier } from "@liveplace/domain/snapshot";
import { judgeChunk } from "./chunk-order";
import { planOrphanPurge } from "./orphan-files";
import { isOutdated, SNAPSHOTS_KEPT } from "./snapshot-order";

export type MemorySnapshotRow = {
  scope: string;
  canvasId: string;
  tier: SnapshotTier;
  version: number;
  takenAt: number;
  schemaVersion: number;
  size: number;
  storageId: string;
  isStateOnly?: boolean;
  accountsFilter?: string;
};

export type MemoryChunkRow = {
  scope: string;
  canvasId: string;
  fromVersion: number;
  toVersion: number;
  fromTs: number;
  toTs: number;
  count: number;
  schemaVersion: number;
  size: number;
  storageId: string;
  accountsFilter?: string;
};

type Usage = { files: { bytes: number; count: number }; chunks: Map<string, number> };

const byTakenAtDesc = (first: MemorySnapshotRow, second: MemorySnapshotRow): number =>
  second.takenAt - first.takenAt;

// `now` date les fichiers envoyés : `_creationTime` de `_storage`, ce que le ménage des fichiers sans ligne regarde.
export function createMemoryDurable(now: () => number = Date.now) {
  const files = new Map<string, Uint8Array>();
  const fileTimes = new Map<string, number>();
  const backgroundFiles = new Set<string>(); // ceux que l'image du fond d'un canvas désigne
  const snapshots: MemorySnapshotRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const pendingErasures: string[] = [];
  const canvases = new Set<string>(); // ceux que la table `canvases` connaît
  const users = new Map<string, RestoredUser>();
  const usage: Usage = { files: { bytes: 0, count: 0 }, chunks: new Map() };

  const addFileUsage = (bytes: number, count: number): void => {
    usage.files = { bytes: usage.files.bytes + bytes, count: usage.files.count + count };
  };
  const addChunkUsage = (scope: string, bytes: number): void => {
    usage.chunks.set(scope, (usage.chunks.get(scope) ?? 0) + bytes);
  };
  const keepFile = (bytes: Uint8Array): string => {
    const storageId = randomUUID();
    files.set(storageId, bytes);
    fileTimes.set(storageId, now());
    return storageId;
  };

  // `orphans.purge` : la même décision que la fonction Convex, `planOrphanPurge`.
  const orphanStore: OrphanStore = {
    async purgeOrphans(after, graceMs, maxFiles) {
      const referenced = new Set([
        ...snapshots.map((row) => row.storageId),
        ...chunks.map((row) => row.storageId),
        ...backgroundFiles,
      ]);
      const page = [...files.keys()]
        .map((id): [string, number] => [id, fileTimes.get(id) ?? 0])
        .filter(([, createdAt]) => createdAt >= after)
        .sort(([, first], [, second]) => first - second)
        .slice(0, maxFiles)
        .map(([id, createdAt]) => ({ id, createdAt }));
      const plan = planOrphanPurge(page, referenced, { nowMs: now(), graceMs, after, pageSize: maxFiles });
      for (const id of plan.orphanIds) {
        files.delete(id);
        fileTimes.delete(id);
      }
      return { next: plan.next, deleted: plan.orphanIds.length, isDone: plan.isDone };
    },
  };

  // `usage.releaseFile` : le fichier part avec sa dernière ligne.
  const releaseFile = (storageId: string, size: number): void => {
    if (snapshots.some((row) => row.storageId === storageId)) return;
    files.delete(storageId);
    addFileUsage(-size, -1);
  };
  const discardSnapshotRow = (row: MemorySnapshotRow): void => {
    snapshots.splice(snapshots.indexOf(row), 1);
    releaseFile(row.storageId, row.size);
  };
  const discardChunkRow = (row: MemoryChunkRow): void => {
    chunks.splice(chunks.indexOf(row), 1);
    files.delete(row.storageId);
    addFileUsage(-row.size, -1);
    addChunkUsage(row.scope, -row.size);
  };

  const rowsOf = (scope: string, canvasId: string, tier: SnapshotTier) =>
    snapshots
      .filter((row) => row.scope === scope && row.canvasId === canvasId && row.tier === tier)
      .sort(byTakenAtDesc);
  const rowAt = (scope: string, canvasId: string, tier: SnapshotTier, takenAt: number) =>
    snapshots.find(
      (row) =>
        row.scope === scope && row.canvasId === canvasId && row.tier === tier && row.takenAt === takenAt,
    );

  const snapshotStore = (scope: string): SnapshotStore => ({
    // `snapshots.record`
    async storeSnapshot({ canvasId, tier, version, takenAt, schemaVersion, bytes, accountsFilter }) {
      const storageId = keepFile(bytes);
      const known = rowsOf(scope, canvasId, tier);
      if (isOutdated({ version, takenAt }, known[0])) {
        files.delete(storageId);
        return "refused";
      }
      snapshots.push({
        scope,
        canvasId,
        tier,
        version,
        takenAt,
        schemaVersion,
        size: bytes.byteLength,
        storageId,
        ...(accountsFilter === undefined ? {} : { accountsFilter }),
      });
      addFileUsage(bytes.byteLength, 1);
      for (const outdated of known.slice(SNAPSHOTS_KEPT - 1)) discardSnapshotRow(outdated);
      return "stored";
    },
    async listLatestSnapshots(tier) {
      const canvasIds = [
        ...new Set(snapshots.filter((row) => row.scope === scope).map((row) => row.canvasId)),
      ];
      return canvasIds.flatMap((canvasId) => {
        const [latest] = rowsOf(scope, canvasId, tier);
        return latest ? [{ canvasId, version: latest.version, takenAt: latest.takenAt }] : [];
      });
    },
    async getLatestSnapshot(canvasId, tier) {
      const [latest] = rowsOf(scope, canvasId, tier);
      const bytes = latest ? files.get(latest.storageId) : undefined;
      return latest && bytes ? { ...latest, bytes } : null;
    },
  });

  const retentionStore = (scope: string): RetentionStore => ({
    async listTiers(afterCanvasId, maxCanvases) {
      const ids = [...new Set(snapshots.filter((row) => row.scope === scope).map((row) => row.canvasId))]
        .sort()
        .filter((canvasId) => canvasId > afterCanvasId);
      const page = ids.slice(0, maxCanvases);
      return {
        canvases: page.map((canvasId) => ({
          canvasId,
          rows: snapshots
            .filter((row) => row.scope === scope && row.canvasId === canvasId)
            .map(({ tier, version, takenAt, isStateOnly }) => ({
              tier,
              version,
              takenAt,
              isStateOnly: isStateOnly ?? false,
            })),
        })),
        next: ids.length > maxCanvases ? (page.at(-1) ?? null) : null,
      };
    },
    // `snapshots.promote` : une ligne de plus qui partage le fichier de sa source.
    async promote(canvasId, from, to) {
      const source = rowAt(scope, canvasId, from.tier, from.takenAt);
      if (!source) return "missing";
      if (rowAt(scope, canvasId, to, source.takenAt)) return "exists";
      snapshots.push({ ...source, tier: to });
      return "promoted";
    },
    async getFile(canvasId, row) {
      const found = rowAt(scope, canvasId, row.tier, row.takenAt);
      const bytes = found ? files.get(found.storageId) : undefined;
      return found && bytes ? { isStateOnly: found.isStateOnly ?? false, bytes } : null;
    },
    // `snapshots.storeStateOnly` : un fichier neuf, sans auteurs, donc sans filtre.
    async storeStateOnly({ canvasId, tier, version, takenAt, schemaVersion, bytes }) {
      const storageId = keepFile(bytes);
      if (rowAt(scope, canvasId, tier, takenAt)) {
        files.delete(storageId);
        return "exists";
      }
      snapshots.push({
        scope,
        canvasId,
        tier,
        version,
        takenAt,
        schemaVersion,
        size: bytes.byteLength,
        storageId,
        isStateOnly: true,
      });
      addFileUsage(bytes.byteLength, 1);
      return "stored";
    },
    // `snapshots.degrade` : la ligne passe à un fichier plus petit, l'ancien part s'il n'a plus de référence.
    async degrade(canvasId, row, bytes) {
      const storageId = keepFile(bytes);
      const found = rowAt(scope, canvasId, row.tier, row.takenAt);
      if (!found || found.isStateOnly) {
        files.delete(storageId);
        return found ? "degraded" : "missing";
      }
      const previous = { storageId: found.storageId, size: found.size };
      Object.assign(found, { storageId, size: bytes.byteLength, isStateOnly: true });
      delete found.accountsFilter;
      addFileUsage(bytes.byteLength, 1);
      releaseFile(previous.storageId, previous.size);
      return "degraded";
    },
    async discard(canvasId, row) {
      const found = rowAt(scope, canvasId, row.tier, row.takenAt);
      if (found) discardSnapshotRow(found);
    },
  });

  const historyStore = (scope: string): HistoryStore => ({
    async listChunkCursors() {
      const canvasIds = [...new Set(chunks.filter((row) => row.scope === scope).map((row) => row.canvasId))];
      return canvasIds.map((canvasId) => ({
        canvasId,
        version: Math.max(
          ...chunks
            .filter((row) => row.scope === scope && row.canvasId === canvasId)
            .map((row) => row.toVersion),
        ),
      }));
    },
    // `chunks.record`
    async storeChunk({
      payload,
      canvasId,
      fromVersion,
      toVersion,
      fromTs,
      toTs,
      count,
      schemaVersion,
      accountsFilter,
    }) {
      const storageId = keepFile(payload);
      const last = chunks
        .filter((row) => row.scope === scope && row.canvasId === canvasId)
        .sort((first, second) => second.fromVersion - first.fromVersion)[0];
      const verdict = judgeChunk({ fromVersion, toVersion, count }, last);
      if (verdict !== "accepted") {
        files.delete(storageId);
        if (verdict === "invalid") throw new Error(`chunk ${canvasId} ${fromVersion}-${toVersion} invalide`);
        return "overlap";
      }
      chunks.push({
        scope,
        canvasId,
        fromVersion,
        toVersion,
        fromTs,
        toTs,
        count,
        schemaVersion,
        size: payload.byteLength,
        storageId,
        ...(accountsFilter === undefined ? {} : { accountsFilter }),
      });
      addFileUsage(payload.byteLength, 1);
      addChunkUsage(scope, payload.byteLength);
      return "stored";
    },
  });

  const recoveryStore = (scope: string): RecoveryStore => ({
    hasSnapshot: async (canvasId) =>
      snapshots.some((row) => row.scope === scope && row.canvasId === canvasId),
    hasCanvas: async (canvasId) => canvases.has(canvasId),
    async listRecentSnapshots(canvasId) {
      return rowsOf(scope, canvasId, "working")
        .slice(0, SNAPSHOTS_KEPT)
        .flatMap(({ version, takenAt, schemaVersion, storageId }) => {
          const bytes = files.get(storageId);
          return bytes ? [{ version, takenAt, schemaVersion, getBytes: async () => bytes }] : [];
        });
    },
    async listUsers(userIds) {
      return userIds.flatMap((userId) => users.get(userId) ?? []);
    },
    listPendingErasures: async () => [...pendingErasures],
  });

  // Les lignes d'un fichier : un snapshot en a plusieurs s'il est partagé, un chunk une seule.
  const rowsOfFile = (kind: "snapshot" | "chunk", storageId: string) =>
    kind === "snapshot"
      ? snapshots.filter((row) => row.storageId === storageId)
      : chunks.filter((row) => row.storageId === storageId);

  const toFile = ({ storageId, size, accountsFilter }: StoredFile): StoredFile => ({
    storageId,
    size,
    ...(accountsFilter === undefined ? {} : { accountsFilter }),
  });

  // `erasures.ts`
  const erasureStore: ErasureStore = {
    listPendingErasures: async () => [...pendingErasures],
    async completeErasure(userId) {
      for (let at = pendingErasures.indexOf(userId); at !== -1; at = pendingErasures.indexOf(userId))
        pendingErasures.splice(at, 1);
    },
    // Des pages dans l'ordre des lignes ; un curseur est un rang. Un fichier partagé ne figure qu'une fois par page.
    async listFiles(kind, cursor, maxFiles) {
      const rows: StoredFile[] =
        kind === "snapshot" ? snapshots.filter((row) => !row.isStateOnly) : chunks.map((row) => row);
      const from = cursor === null ? 0 : Number(cursor);
      const page = rows.slice(from, from + maxFiles);
      const unique = new Map(page.map((row) => [row.storageId, toFile(row)]));
      return {
        files: [...unique.values()],
        next: from + maxFiles >= rows.length ? null : String(from + maxFiles),
      };
    },
    async getFile(_kind, storageId) {
      return files.get(storageId) ?? null;
    },
    async replaceFile(kind, storageId, bytes, accountsFilter) {
      const replacementId = keepFile(bytes);
      const rows = rowsOfFile(kind, storageId);
      const [first] = rows;
      if (!first) {
        files.delete(replacementId);
        return "missing";
      }
      const growth = bytes.byteLength - first.size;
      for (const row of rows)
        Object.assign(row, { storageId: replacementId, size: bytes.byteLength, accountsFilter });
      addFileUsage(growth, 0);
      if (kind === "chunk") addChunkUsage(first.scope, growth);
      files.delete(storageId);
      return "replaced";
    },
    async stampFilter(kind, storageId, accountsFilter) {
      for (const row of rowsOfFile(kind, storageId)) row.accountsFilter = accountsFilter;
    },
    async discardFile(kind, storageId) {
      for (const row of rowsOfFile(kind, storageId)) {
        if ("tier" in row) discardSnapshotRow(row);
        else discardChunkRow(row);
      }
    },
  };

  // Les compteurs refaits depuis les lignes (`usage.recount`) : un fichier partagé ne se compte qu'une fois.
  const recountUsage = (): Usage => {
    const sizes = new Map<string, number>();
    const chunkTotals = new Map<string, number>();
    for (const row of snapshots) sizes.set(row.storageId, row.size);
    for (const row of chunks) {
      sizes.set(row.storageId, row.size);
      chunkTotals.set(row.scope, (chunkTotals.get(row.scope) ?? 0) + row.size);
    }
    return {
      files: { bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0), count: sizes.size },
      chunks: chunkTotals,
    };
  };

  return {
    files,
    snapshots,
    chunks,
    canvases,
    users,
    usage,
    pendingErasures,
    recountUsage,
    orphanStore,
    backgroundFiles,
    // Un envoi dont personne n'enregistre rien : ce qu'un échec entre `uploadFile` et `record` laisse.
    upload: keepFile,
    snapshotStore,
    retentionStore,
    historyStore,
    recoveryStore,
    erasureStore,
    // `erasures.request`
    requestErasure: async (userId: string): Promise<void> => {
      if (!pendingErasures.includes(userId)) pendingErasures.push(userId);
    },
  };
}

export type MemoryDurable = ReturnType<typeof createMemoryDurable>;
