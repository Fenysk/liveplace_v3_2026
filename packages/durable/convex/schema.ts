// Le schéma Convex (§8.1) : `users` et `canvases`. `chunks`, `snapshots` et `moderationLog` arrivent avec le worker.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Le pseudo n'est jamais un identifiant : il peut changer chez Twitch.
  users: defineTable({
    userId: v.string(), // = Twitch ID (§5.1)
    login: v.string(),
    displayName: v.string(),
    avatarUrl: v.string(),
    createdAt: v.number(),
    lastSignInAt: v.number(), // Écart §8.1 (JOURNAL 2026-09-22)
  })
    .index("by_userId", ["userId"])
    .index("by_login", ["login"]),

  // `canvasId` est opaque (D-14) : un propriétaire a exactement un canvas actif.
  canvases: defineTable({
    canvasId: v.string(),
    ownerId: v.string(),
    isActive: v.boolean(),
    width: v.number(),
    height: v.number(),
    createdAt: v.number(),
    purgedBeforeVersion: v.number(), // curseur de purge du worker (D-18), 0 à la création
    purgedBeforeTs: v.number(),
  })
    .index("by_canvasId", ["canvasId"])
    .index("by_owner_active", ["ownerId", "isActive"]),
});
