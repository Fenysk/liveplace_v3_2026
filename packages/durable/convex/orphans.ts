// Les fichiers qu'aucune ligne ne désigne (JOURNAL 2026-11-02) : un envoi dont l'enregistrement a échoué n'est compté nulle part et
// aucun ménage ne l'atteignait. La décision est dans `src/orphan-files.ts` ; ici, la lecture de `_storage` et de ses références.

import { v } from "convex/values";
import { planOrphanPurge } from "../src/orphan-files";
import { requireServiceKey } from "../src/service-key";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";

const PAGE_MAX = 100; // une transaction lit trois index par fichier : elle reste petite

// Un fichier est désigné par une ligne de snapshot, une ligne de chunk, ou l'image du fond d'un canvas.
const isReferenced = async (ctx: Pick<MutationCtx, "db">, storageId: Id<"_storage">): Promise<boolean> => {
  const snapshot = await ctx.db
    .query("snapshots")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (snapshot) return true;
  const chunk = await ctx.db
    .query("chunks")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (chunk) return true;
  const canvas = await ctx.db
    .query("canvases")
    .withIndex("by_backgroundStorage", (q) => q.eq("backgroundImage.storageId", storageId))
    .first();
  return canvas !== null;
};

// Les fichiers à partir de `after` (borne rendue par le passage d'avant, 0 au premier), du plus ancien au plus récent. Rend la
// borne du prochain passage, combien sont partis, et `isDone` quand il n'y a plus rien d'assez vieux à voir.
export const purge = mutation({
  args: { serviceKey: v.string(), after: v.number(), graceMs: v.number(), maxFiles: v.number() },
  handler: async (ctx, { serviceKey, after, graceMs, maxFiles }) => {
    requireServiceKey(serviceKey);
    const pageSize = Math.min(maxFiles, PAGE_MAX);
    const files = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", after))
      .take(pageSize);
    const referenced = new Set<string>();
    for (const { _id } of files) if (await isReferenced(ctx, _id)) referenced.add(_id);
    const plan = planOrphanPurge(
      files.map(({ _id, _creationTime }) => ({ id: _id, createdAt: _creationTime })),
      referenced,
      { nowMs: Date.now(), graceMs, after, pageSize },
    );
    for (const id of plan.orphanIds) await ctx.storage.delete(id as Id<"_storage">); // les identifiants viennent de `_storage`
    return { next: plan.next, deleted: plan.orphanIds.length, isDone: plan.isDone };
  },
});
