// L'historique d'un canvas : un fichier par chunk, une ligne d'index (§8.2, Écart §7.2, JOURNAL 2026-10-08). L'envoi du
// fichier passe par `snapshots.generateUploadUrl`, comme celui d'un snapshot.

import { v } from "convex/values";
import { judgeChunk } from "../src/chunk-order";
import { requireServiceKey } from "../src/service-key";
import { mutation, query } from "./_generated/server";
import { addUsage, chunksKey, discardChunkRow, FILES_KEY } from "./usage";

const BY_CANVAS_VERSION = "by_scope_canvas_version";

// Une mutation est une transaction : deux workers qui rangent le même intervalle ne le rangent pas deux fois. Refusé, le
// fichier envoyé part avec : rien n'y renvoie.
export const record = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    fromVersion: v.number(),
    toVersion: v.number(),
    fromTs: v.number(),
    toTs: v.number(),
    count: v.number(),
    schemaVersion: v.number(),
    size: v.number(),
    storageId: v.id("_storage"),
    gaps: v.optional(v.array(v.object({ from: v.number(), to: v.number() }))),
    resizedAt: v.optional(v.number()),
    recoveredAt: v.optional(v.number()),
  },
  handler: async (ctx, { serviceKey, ...incoming }) => {
    requireServiceKey(serviceKey);
    const last = await ctx.db
      .query("chunks")
      .withIndex(BY_CANVAS_VERSION, (q) => q.eq("scope", incoming.scope).eq("canvasId", incoming.canvasId))
      .order("desc")
      .first();
    const verdict = judgeChunk(incoming, last ?? undefined);
    if (verdict !== "accepted") {
      await ctx.storage.delete(incoming.storageId);
      return verdict;
    }
    await ctx.db.insert("chunks", incoming);
    await addUsage(ctx, FILES_KEY, incoming.size, 1);
    await addUsage(ctx, chunksKey(incoming.scope), incoming.size, 1);
    return "stored" as const;
  },
});

// Le dernier `toVersion` de chaque canvas d'un scope : ce que le worker lit à son démarrage. Un saut d'index d'un canvas
// au suivant, puis une lecture à l'envers : jamais tous les chunks.
export const listCursors = query({
  args: { serviceKey: v.string(), scope: v.string() },
  handler: async (ctx, { serviceKey, scope }) => {
    requireServiceKey(serviceKey);
    const cursors: { canvasId: string; version: number }[] = [];
    let after = "";
    for (;;) {
      const next = await ctx.db
        .query("chunks")
        .withIndex(BY_CANVAS_VERSION, (q) => q.eq("scope", scope).gt("canvasId", after))
        .first();
      if (!next) return cursors;
      const last = await ctx.db
        .query("chunks")
        .withIndex(BY_CANVAS_VERSION, (q) => q.eq("scope", scope).eq("canvasId", next.canvasId))
        .order("desc")
        .first();
      cursors.push({ canvasId: next.canvasId, version: (last ?? next).toVersion });
      after = next.canvasId;
    }
  },
});

// Les plus anciens chunks d'un scope, canvas confondus : ce que le budget regarde pour savoir quoi retirer d'abord.
export const listOldest = query({
  args: { serviceKey: v.string(), scope: v.string(), limit: v.number() },
  handler: async (ctx, { serviceKey, scope, limit }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("chunks")
      .withIndex("by_scope_toTs", (q) => q.eq("scope", scope))
      .take(limit);
    return rows.map(({ canvasId, fromVersion, toVersion, toTs, size }) => ({
      canvasId,
      fromVersion,
      toVersion,
      toTs,
      size,
    }));
  },
});

// Un lot de chunks d'un canvas, du plus ancien, jusqu'à `beforeVersion` (exclue) : le plancher est revérifié ici, ce que le
// worker a décidé il y a une minute ne prime pas sur lui. Le curseur du canvas avance avec chaque lot, donc une purge
// interrompue reprend où elle s'est arrêtée.
export const purgeBatch = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    beforeVersion: v.number(),
    floorTs: v.number(),
    maxChunks: v.number(),
  },
  handler: async (ctx, { serviceKey, scope, canvasId, beforeVersion, floorTs, maxChunks }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("chunks")
      .withIndex(BY_CANVAS_VERSION, (q) => q.eq("scope", scope).eq("canvasId", canvasId))
      .take(maxChunks);
    let removed = 0;
    let bytes = 0;
    let lastVersion = 0;
    let lastTs = 0;
    for (const row of rows) {
      if (row.toVersion >= beforeVersion || row.toTs >= floorTs) break;
      await discardChunkRow(ctx, row);
      removed += 1;
      bytes += row.size;
      lastVersion = row.toVersion;
      lastTs = row.toTs;
    }
    const canvas = removed
      ? await ctx.db
          .query("canvases")
          .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
          .first()
      : null;
    if (canvas)
      await ctx.db.patch(canvas._id, {
        purgedBeforeVersion: Math.max(canvas.purgedBeforeVersion, lastVersion + 1),
        purgedBeforeTs: Math.max(canvas.purgedBeforeTs, lastTs + 1),
      });
    return { removed, bytes, isDone: removed < maxChunks };
  },
});
