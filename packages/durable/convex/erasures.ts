// CDC §8, Supprimer son compte (JOURNAL 2026-11-02) : ce que le worker lit et réécrit dans Convex pour qu'aucun fichier de
// sauvegarde ne nomme un compte supprimé. Toutes les fonctions exigent `serviceKey`, et aucune ne dépend d'un scope : le
// déploiement entier ne doit plus rien garder qui nomme le compte.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { addUsage, chunksKey, discardChunkRow, discardSnapshotRow, FILES_KEY } from "./usage";

const PENDING_MAX = 200; // des comptes demandés à la fois : bien au-delà de ce qu'un jour de suppressions en demande
const FILES_PER_PAGE_MAX = 100;

const fileKind = v.union(v.literal("snapshot"), v.literal("chunk"));

type FileRow = { storageId: Id<"_storage">; size: number; accountsFilter?: string | undefined };

// Sans le filtre d'un fichier, la clé reste absente : le worker lit le fichier une fois et le marque.
const toFile = ({ storageId, size, accountsFilter }: FileRow) => ({
  storageId,
  size,
  ...(accountsFilter === undefined ? {} : { accountsFilter }),
});

// Idempotent : un compte déjà demandé garde sa ligne. À poser après la purge de Redis (le worker ne le sait pas autrement).
export const request = mutation({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, { serviceKey, userId }) => {
    requireServiceKey(serviceKey);
    const known = await ctx.db
      .query("erasures")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!known) await ctx.db.insert("erasures", { userId, requestedAt: Date.now() });
  },
});

export const listPending = query({
  args: { serviceKey: v.string() },
  handler: async (ctx, { serviceKey }) => {
    requireServiceKey(serviceKey);
    return (await ctx.db.query("erasures").take(PENDING_MAX)).map(({ userId }) => userId);
  },
});

// Tous les fichiers sont réécrits : la demande part, et l'identifiant avec elle.
export const complete = mutation({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, { serviceKey, userId }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("erasures")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

// Une page de lignes, des plus anciennes aux plus récentes : une ligne écrite pendant la passe arrive plus loin, jamais derrière
// le curseur. Les snapshots en `state` seul ne nomment personne. Un fichier que plusieurs lignes se partagent n'y figure qu'une fois.
export const listFiles = query({
  args: {
    serviceKey: v.string(),
    kind: fileKind,
    cursor: v.union(v.string(), v.null()),
    maxFiles: v.number(),
  },
  handler: async (ctx, { serviceKey, kind, cursor, maxFiles }) => {
    requireServiceKey(serviceKey);
    const numItems = Math.min(maxFiles, FILES_PER_PAGE_MAX);
    const { page, isDone, continueCursor } =
      kind === "snapshot"
        ? await ctx.db.query("snapshots").paginate({ numItems, cursor })
        : await ctx.db.query("chunks").paginate({ numItems, cursor });
    const rows: FileRow[] = page.filter((row) => !("isStateOnly" in row && row.isStateOnly));
    const files = new Map(rows.map((row) => [row.storageId, toFile(row)]));
    return { files: [...files.values()], next: isDone ? null : continueCursor };
  },
});

export const getFileUrl = query({
  args: { serviceKey: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { serviceKey, storageId }) => {
    requireServiceKey(serviceKey);
    return ctx.storage.getUrl(storageId);
  },
});

// Toutes les lignes qui désignent ce fichier, d'un bloc : une promotion en ajoute qui le partagent. Un chunk n'en a qu'une.
const listRowsOf = (ctx: Pick<MutationCtx, "db">, kind: "snapshot" | "chunk", storageId: Id<"_storage">) =>
  kind === "snapshot"
    ? ctx.db
        .query("snapshots")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .collect()
    : ctx.db
        .query("chunks")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .collect();

// Le nouveau fichier prend la place de l'ancien dans toutes ses lignes et dans les compteurs, puis l'ancien part : une seule
// transaction, donc jamais deux fichiers comptés, ni une ligne sans fichier. `missing` : plus aucune ligne ne désigne l'ancien
// (supprimé entre-temps), le nouveau fichier part avec.
export const replaceFile = mutation({
  args: {
    serviceKey: v.string(),
    kind: fileKind,
    storageId: v.id("_storage"),
    replacementId: v.id("_storage"),
    size: v.number(),
    accountsFilter: v.string(),
  },
  handler: async (ctx, { serviceKey, kind, storageId, replacementId, size, accountsFilter }) => {
    requireServiceKey(serviceKey);
    const rows = await listRowsOf(ctx, kind, storageId);
    const [first] = rows;
    if (!first) {
      await ctx.storage.delete(replacementId);
      return "missing" as const;
    }
    for (const row of rows) await ctx.db.patch(row._id, { storageId: replacementId, size, accountsFilter });
    await addUsage(ctx, FILES_KEY, size - first.size, 0);
    if (kind === "chunk") await addUsage(ctx, chunksKey(first.scope), size - first.size, 0);
    if (await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
    return "replaced" as const;
  },
});

// Un fichier lu qui ne nomme personne reçoit son filtre : les passes suivantes ne le téléchargent plus.
export const stampFilter = mutation({
  args: { serviceKey: v.string(), kind: fileKind, storageId: v.id("_storage"), accountsFilter: v.string() },
  handler: async (ctx, { serviceKey, kind, storageId, accountsFilter }) => {
    requireServiceKey(serviceKey);
    for (const row of await listRowsOf(ctx, kind, storageId)) await ctx.db.patch(row._id, { accountsFilter });
  },
});

// Un fichier que le codec ne lit pas : personne ne peut le restaurer, aucun test ne prouve qu'il ne nomme pas le compte. Ses lignes
// partent, et lui avec la dernière.
export const discardFile = mutation({
  args: { serviceKey: v.string(), kind: fileKind, storageId: v.id("_storage") },
  handler: async (ctx, { serviceKey, kind, storageId }) => {
    requireServiceKey(serviceKey);
    for (const row of await listRowsOf(ctx, kind, storageId)) {
      if ("tier" in row) await discardSnapshotRow(ctx, row);
      else await discardChunkRow(ctx, row);
    }
  },
});
