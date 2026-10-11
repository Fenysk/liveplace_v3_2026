// Le client typé du stockage durable (§8.2) : appelé depuis Node, jamais depuis un navigateur (§8.3).

import { MAX_ARCHIVES } from "@liveplace/domain";
import type {
  BudgetStore,
  DurableStore,
  HistoryStore,
  RecoveryStore,
  RetentionStore,
  SnapshotStore,
} from "@liveplace/domain/ports";
import type { SnapshotTier } from "@liveplace/domain/snapshot";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

// Le fichier part à l'adresse d'envoi de Convex, qui répond le `storageId` à ranger dans l'index.
async function uploadFile(uploadUrl: string, bytes: Uint8Array): Promise<Id<"_storage">> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes), // une copie : `fetch` du DOM n'accepte qu'un tampon de type `ArrayBuffer`
  });
  if (!response.ok) throw new Error(`envoi du fichier refusé par Convex (${response.status})`);
  const reply: unknown = await response.json();
  const storageId =
    typeof reply === "object" && reply !== null && "storageId" in reply ? reply.storageId : null;
  if (typeof storageId !== "string") throw new Error("Convex n'a pas rendu de storageId");
  return storageId as Id<"_storage">; // l'identifiant d'un fichier que Convex vient de ranger
}

// Un fichier de Convex, lu d'un coup : `what` nomme ce qu'on lit, pour le message d'un refus.
async function downloadFile(fileUrl: string, what: string): Promise<Uint8Array> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`lecture de ${what} refusée par Convex (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export function createDurableStore(url: string, serviceKey: string): DurableStore {
  const convex = new ConvexHttpClient(url);
  return {
    async upsertUserFromTwitch(user, discoveredViaUserId) {
      const discovered = discoveredViaUserId ? { discoveredViaUserId } : {};
      await convex.mutation(api.users.upsertFromTwitch, { serviceKey, ...user, ...discovered });
    },
    getUserByLogin: (login) => convex.query(api.users.getByLogin, { serviceKey, login }),
    ensureCanvasForOwner: (ownerId, candidate) =>
      convex.mutation(api.canvases.ensureForOwner, { serviceKey, ownerId, ...candidate }),
    getActiveCanvasForOwner: (ownerId) =>
      convex.query(api.canvases.getActiveForOwner, { serviceKey, ownerId }),

    // Écart §15 (JOURNAL 2026-10-06) : les archives. Un refus de Convex est une valeur `{ ok: false, error }`.
    listCanvasesForOwner: (ownerId) => convex.query(api.canvases.listForOwner, { serviceKey, ownerId }),
    async archiveActiveCanvas({ incoming, theme, ...archiving }) {
      const result = await convex.mutation(api.canvases.archiveActive, {
        serviceKey,
        ...archiving,
        incomingId: incoming.canvasId,
        width: incoming.width,
        height: incoming.height,
        maxArchives: MAX_ARCHIVES,
        ...(theme ? { theme } : {}),
      });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async reopenArchive(reopening) {
      const result = await convex.mutation(api.canvases.reopen, { serviceKey, ...reopening });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async setActiveCanvasTheme(ownerId, canvasId, theme) {
      const result = await convex.mutation(api.canvases.setTheme, {
        serviceKey,
        ownerId,
        canvasId,
        ...(theme ? { theme } : {}),
      });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    // Écart §8.1 (JOURNAL 2026-10-10) : l'image du fond part à l'adresse d'envoi de Convex, comme un snapshot, puis la mutation la
    // range sur le canvas actif ; un refus de Convex est une valeur, et le fichier part avec.
    async setActiveCanvasBackgroundImage(ownerId, canvasId, image) {
      const uploadUrl = await convex.mutation(api.snapshots.generateUploadUrl, { serviceKey });
      const storageId = await uploadFile(uploadUrl, image);
      const result = await convex.mutation(api.canvases.setBackgroundImage, {
        serviceKey,
        ownerId,
        canvasId,
        storageId,
        size: image.byteLength,
      });
      return result.ok ? { ok: true, value: { at: result.at } } : result;
    },
    async clearActiveCanvasBackgroundImage(ownerId, canvasId) {
      const result = await convex.mutation(api.canvases.clearBackgroundImage, {
        serviceKey,
        ownerId,
        canvasId,
      });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async getActiveCanvasBackgroundImage(ownerId, at) {
      const url = await convex.query(api.canvases.getBackgroundImageUrl, { serviceKey, ownerId, at });
      return url ? downloadFile(url, "l'image du fond") : null;
    },
    async discardArchive(ownerId, canvasId) {
      const result = await convex.mutation(api.canvases.discard, { serviceKey, ownerId, canvasId });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    getArchiveByLinkCode: (ownerId, linkCode) =>
      convex.query(api.canvases.getByLinkCode, { serviceKey, ownerId, linkCode }),
  };
}

// Les snapshots d'un seul `DURABLE_SCOPE` (Écart §8.1, JOURNAL 2026-10-06) : le scope entre dans chaque appel.
export function createSnapshotStore(url: string, serviceKey: string, scope: string): SnapshotStore {
  const convex = new ConvexHttpClient(url);
  return {
    async storeSnapshot({ canvasId, tier, version, takenAt, schemaVersion, bytes }) {
      const uploadUrl = await convex.mutation(api.snapshots.generateUploadUrl, { serviceKey });
      const storageId = await uploadFile(uploadUrl, bytes);
      return convex.mutation(api.snapshots.record, {
        serviceKey,
        scope,
        canvasId,
        tier,
        version,
        takenAt,
        schemaVersion,
        size: bytes.byteLength,
        storageId,
      });
    },

    listLatestSnapshots: (tier) => convex.query(api.snapshots.listLatest, { serviceKey, scope, tier }),

    async getLatestSnapshot(canvasId, tier) {
      const latest = await convex.query(api.snapshots.getLatest, { serviceKey, scope, canvasId, tier });
      if (!latest?.url) return null;
      const { version, takenAt, schemaVersion } = latest;
      return {
        canvasId,
        tier,
        version,
        takenAt,
        schemaVersion,
        bytes: await downloadFile(latest.url, `le snapshot ${canvasId}`),
      };
    },
  };
}

// L'historique d'un seul `DURABLE_SCOPE` (Écart §7.2, JOURNAL 2026-10-08) : le fichier part comme celui d'un snapshot.
export function createHistoryStore(url: string, serviceKey: string, scope: string): HistoryStore {
  const convex = new ConvexHttpClient(url);
  return {
    listChunkCursors: () => convex.query(api.chunks.listCursors, { serviceKey, scope }),

    async storeChunk({ payload, ...index }) {
      const uploadUrl = await convex.mutation(api.snapshots.generateUploadUrl, { serviceKey });
      const storageId = await uploadFile(uploadUrl, payload);
      const verdict = await convex.mutation(api.chunks.record, {
        serviceKey,
        scope,
        ...index,
        size: payload.byteLength,
        storageId,
      });
      if (verdict === "invalid")
        throw new Error(`chunk ${index.canvasId} ${index.fromVersion}-${index.toVersion} invalide`);
      return verdict === "stored" ? "stored" : "overlap";
    },
  };
}

// Les paliers d'un seul `DURABLE_SCOPE` (Écart §7.3, JOURNAL 2026-10-08) : les lignes se nomment par palier et date, jamais par
// leur identifiant Convex.
export function createRetentionStore(url: string, serviceKey: string, scope: string): RetentionStore {
  const convex = new ConvexHttpClient(url);
  const named = (canvasId: string, { tier, takenAt }: { tier: SnapshotTier; takenAt: number }) => ({
    serviceKey,
    scope,
    canvasId,
    tier,
    takenAt,
  });
  return {
    listTiers: (afterCanvasId, maxCanvases) =>
      convex.query(api.snapshots.listTiers, { serviceKey, scope, afterCanvasId, maxCanvases }),

    promote: (canvasId, from, to) =>
      convex.mutation(api.snapshots.promote, {
        serviceKey,
        scope,
        canvasId,
        fromTier: from.tier,
        fromTakenAt: from.takenAt,
        toTier: to,
      }),

    async getFile(canvasId, row) {
      const file = await convex.query(api.snapshots.getFile, named(canvasId, row));
      if (!file?.url) return null;
      return {
        isStateOnly: file.isStateOnly,
        bytes: await downloadFile(file.url, `le palier de ${canvasId}`),
      };
    },

    async storeStateOnly({ canvasId, tier, version, takenAt, schemaVersion, bytes }) {
      const uploadUrl = await convex.mutation(api.snapshots.generateUploadUrl, { serviceKey });
      const storageId = await uploadFile(uploadUrl, bytes);
      return convex.mutation(api.snapshots.storeStateOnly, {
        serviceKey,
        scope,
        canvasId,
        tier,
        version,
        takenAt,
        schemaVersion,
        size: bytes.byteLength,
        storageId,
      });
    },

    async degrade(canvasId, row, bytes) {
      const uploadUrl = await convex.mutation(api.snapshots.generateUploadUrl, { serviceKey });
      const storageId = await uploadFile(uploadUrl, bytes);
      return convex.mutation(api.snapshots.degrade, {
        ...named(canvasId, row),
        size: bytes.byteLength,
        storageId,
      });
    },

    async discard(canvasId, row) {
      await convex.mutation(api.snapshots.discard, named(canvasId, row));
    },
  };
}

// Le budget de l'historique d'un seul `DURABLE_SCOPE` (Écart §8.1, JOURNAL 2026-10-08) : le total vient d'un compteur, une ligne.
export function createBudgetStore(url: string, serviceKey: string, scope: string): BudgetStore {
  const convex = new ConvexHttpClient(url);
  return {
    ensureUsage: () => convex.mutation(api.usage.ensure, { serviceKey }),
    getHistoryBytes: () => convex.query(api.usage.chunkBytes, { serviceKey, scope }),
    listOldestChunks: (limit) => convex.query(api.chunks.listOldest, { serviceKey, scope, limit }),
    purgeChunks: (canvasId, beforeVersion, floorTs, maxChunks) =>
      convex.mutation(api.chunks.purgeBatch, {
        serviceKey,
        scope,
        canvasId,
        beforeVersion,
        floorTs,
        maxChunks,
      }),
  };
}

const USERS_PER_QUERY = 200; // les noms d'un canvas par lots : une requête Convex lit un document par personne

// Ce que la récupération lit de Convex pour un seul `DURABLE_SCOPE` (Écart §7.2, JOURNAL 2026-10-08) : seulement pour un canvas
// perdu, ou à la connexion de son streamer. Le fichier d'une sauvegarde ne se télécharge que si on le demande.
export function createRecoveryStore(url: string, serviceKey: string, scope: string): RecoveryStore {
  const convex = new ConvexHttpClient(url);
  return {
    hasSnapshot: (canvasId) => convex.query(api.snapshots.has, { serviceKey, scope, canvasId }),

    hasCanvas: (canvasId) => convex.query(api.canvases.exists, { serviceKey, canvasId }),

    async listRecentSnapshots(canvasId) {
      const recent = await convex.query(api.snapshots.listRecent, {
        serviceKey,
        scope,
        canvasId,
        tier: "working",
      });
      return recent.flatMap(({ version, takenAt, schemaVersion, url: fileUrl }) =>
        fileUrl === null
          ? []
          : [
              {
                version,
                takenAt,
                schemaVersion,
                getBytes: () => downloadFile(fileUrl, `le snapshot ${canvasId}`),
              },
            ],
      );
    },

    async listUsers(userIds) {
      const found = [];
      for (let first = 0; first < userIds.length; first += USERS_PER_QUERY)
        found.push(
          ...(await convex.query(api.users.listByUserIds, {
            serviceKey,
            userIds: userIds.slice(first, first + USERS_PER_QUERY),
          })),
        );
      return found;
    },
  };
}
