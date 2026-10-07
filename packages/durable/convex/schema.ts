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
    lastSignInAt: v.number(), // §8.1
    // §8.1 : jamais affiché, jamais hors de Convex ; aucun envoi avant un consentement.
    email: v.optional(v.string()),
    discoveredViaUserId: v.optional(v.string()), // le streamer d'où part la première connexion
  })
    .index("by_userId", ["userId"])
    .index("by_login", ["login"]),

  // `canvasId` est opaque (D-14) : un propriétaire a exactement un canvas actif, et au plus cinq archives.
  canvases: defineTable({
    canvasId: v.string(),
    ownerId: v.string(),
    isActive: v.boolean(),
    width: v.number(),
    height: v.number(),
    createdAt: v.number(),
    purgedBeforeVersion: v.number(), // curseur de purge du worker (D-18), 0 à la création
    purgedBeforeTs: v.number(),
    // Écart §15 (JOURNAL 2026-10-06) : ajoutés, jamais requis, pour les canvas d'avant. Le code et le thème survivent à
    // une réouverture ; la date d'archivage non.
    archivedAt: v.optional(v.number()),
    theme: v.optional(v.string()), // Écart §8.1 (JOURNAL 2026-10-07)
    // Ancien nom du thème, recopié dans `theme` par `canvases:moveNameToTheme`, retiré au prochain changement de schéma.
    name: v.optional(v.string()),
    linkCode: v.optional(v.string()),
  })
    .index("by_canvasId", ["canvasId"])
    .index("by_owner_active", ["ownerId", "isActive"]),
});
