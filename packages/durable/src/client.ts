// Le client typé du stockage durable (§8.2) : appelé depuis Node, jamais depuis un navigateur (§8.3).

import { MAX_ARCHIVES } from "@liveplace/domain";
import type { DurableStore } from "@liveplace/domain/ports";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

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
    async archiveActiveCanvas({ incoming, name, ...archiving }) {
      const result = await convex.mutation(api.canvases.archiveActive, {
        serviceKey,
        ...archiving,
        incomingId: incoming.canvasId,
        width: incoming.width,
        height: incoming.height,
        maxArchives: MAX_ARCHIVES,
        ...(name ? { name } : {}),
      });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async reopenArchive(reopening) {
      const result = await convex.mutation(api.canvases.reopen, { serviceKey, ...reopening });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async renameActiveCanvas(ownerId, canvasId, name) {
      const result = await convex.mutation(api.canvases.rename, {
        serviceKey,
        ownerId,
        canvasId,
        ...(name ? { name } : {}),
      });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    async discardArchive(ownerId, canvasId) {
      const result = await convex.mutation(api.canvases.discard, { serviceKey, ownerId, canvasId });
      return result.ok ? { ok: true, value: undefined } : result;
    },
    getArchiveByLinkCode: (ownerId, linkCode) =>
      convex.query(api.canvases.getByLinkCode, { serviceKey, ownerId, linkCode }),
  };
}
