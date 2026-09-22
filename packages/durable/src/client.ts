// Le client typé du stockage durable (§8.2) : appelé depuis Node, jamais depuis un navigateur (§8.3).

import type { DurableStore } from "@liveplace/domain/ports";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

export function createDurableStore(url: string, serviceKey: string): DurableStore {
  const convex = new ConvexHttpClient(url);
  return {
    async upsertUserFromTwitch(user) {
      await convex.mutation(api.users.upsertFromTwitch, { serviceKey, ...user });
    },
    getUserByLogin: (login) => convex.query(api.users.getByLogin, { serviceKey, login }),
    ensureCanvasForOwner: (ownerId, candidate) =>
      convex.mutation(api.canvases.ensureForOwner, { serviceKey, ownerId, ...candidate }),
    getActiveCanvasForOwner: (ownerId) =>
      convex.query(api.canvases.getActiveForOwner, { serviceKey, ownerId }),
  };
}
