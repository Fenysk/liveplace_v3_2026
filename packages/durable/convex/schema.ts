// Le schéma Convex (§8.1) : `users`, `canvases` et `snapshots`. `chunks` et `moderationLog` arrivent avec l'archive.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Les paliers de `SNAPSHOT_TIERS` (domain) : Convex ne le voit pas, un test garde les deux listes ensemble.
export const snapshotTier = v.union(
  v.literal("working"),
  v.literal("hourly"),
  v.literal("daily"),
  v.literal("weekly"),
);

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

  // Une ligne par snapshot : le contenu est un fichier (Écart §8.1, JOURNAL 2026-10-06). `scope` nomme l'environnement :
  // le poste et les bêtas partagent ce déploiement, et un même `canvasId` existe dans plusieurs Redis.
  snapshots: defineTable({
    scope: v.string(),
    canvasId: v.string(),
    tier: snapshotTier,
    version: v.number(),
    takenAt: v.number(),
    schemaVersion: v.number(),
    size: v.number(), // octets du fichier
    storageId: v.id("_storage"),
    // Écart §7.3 (JOURNAL 2026-10-08) : le dessin seul, sans auteurs. Absent : une sauvegarde complète. Un fichier peut servir
    // plusieurs lignes (une promotion en ajoute une sans le copier) : `by_storage` compte ses références.
    isStateOnly: v.optional(v.boolean()),
  })
    .index("by_scope_canvas_tier_takenAt", ["scope", "canvasId", "tier", "takenAt"])
    .index("by_canvas", ["canvasId"]) // le ménage d'un canvas supprimé, tous scopes (JOURNAL 2026-10-08)
    .index("by_storage", ["storageId"]),

  // Une ligne par chunk de l'historique : les entrées du flux sont dans le fichier (Écart §7.2, JOURNAL 2026-10-08). Les
  // chunks d'un canvas se suivent sans se recouvrir, des trous permis.
  chunks: defineTable({
    scope: v.string(),
    canvasId: v.string(),
    fromVersion: v.number(),
    toVersion: v.number(),
    fromTs: v.number(),
    toTs: v.number(),
    count: v.number(),
    schemaVersion: v.number(),
    size: v.number(), // octets du fichier
    storageId: v.id("_storage"),
    gaps: v.optional(v.array(v.object({ from: v.number(), to: v.number() }))), // des versions perdues
    resizedAt: v.optional(v.number()), // la version sans événement d'un changement de taille
    recoveredAt: v.optional(v.number()), // la date d'une récupération : posé par l'étape E, jamais par le worker
  })
    .index("by_scope_canvas_version", ["scope", "canvasId", "fromVersion"])
    .index("by_scope_toTs", ["scope", "toTs"]) // le budget retire le plus ancien d'abord, canvas confondus
    .index("by_canvas", ["canvasId"]),

  // Écart §8.1 (JOURNAL 2026-10-08) : les octets des fichiers, comptés à chaque ajout et retrait pour qu'une lecture n'en coûte
  // qu'une ligne. `files` : tous les fichiers du déploiement ; `chunks:<scope>` : l'historique d'un scope, que le budget borne.
  storageUsage: defineTable({
    key: v.string(),
    bytes: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
