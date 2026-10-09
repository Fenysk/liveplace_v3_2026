// Écart §8.1 (JOURNAL 2026-10-08) : ce que Convex garde d'un canvas supprimé part avec lui, en tâche de fond.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { discardChunkRow, discardSnapshotRow } from "./usage";

const PURGE_ROWS_PER_PASS = 100; // une transaction reste petite : lignes et fichiers par centaines, jamais d'un coup
const RECHECK_MS = 60_000; // une sauvegarde partie pendant la suppression arrive après le dernier lot

// Tous scopes confondus : un `canvasId` est un UUID, supprimé pour tout le monde. Les sauvegardes d'abord, l'historique
// avec le reste du lot ; le fichier part avec sa ligne.
export const byCanvas = internalMutation({
  args: { canvasId: v.string(), isRecheck: v.optional(v.boolean()) },
  handler: async (ctx, { canvasId, isRecheck }) => {
    const snapshots = await ctx.db
      .query("snapshots")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .take(PURGE_ROWS_PER_PASS);
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .take(PURGE_ROWS_PER_PASS - snapshots.length);
    // Un fichier déjà parti ne fait pas échouer le lot ; un fichier que des paliers se partagent part avec sa dernière ligne.
    for (const row of snapshots) await discardSnapshotRow(ctx, row);
    for (const row of chunks) await discardChunkRow(ctx, row);
    const next = { canvasId, ...(isRecheck ? { isRecheck } : {}) };
    if (snapshots.length + chunks.length === PURGE_ROWS_PER_PASS)
      await ctx.scheduler.runAfter(0, internal.purge.byCanvas, next);
    else if (!isRecheck)
      await ctx.scheduler.runAfter(RECHECK_MS, internal.purge.byCanvas, { canvasId, isRecheck: true });
  },
});
