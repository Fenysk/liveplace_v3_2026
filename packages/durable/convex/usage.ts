// Les octets des fichiers (Écart §8.1, JOURNAL 2026-10-08) : un compteur par clé, tenu à chaque ajout et retrait de fichier, pour que
// les lire coûte une ligne et jamais un parcours de `_storage` (1 Go d'E/S par mois pour la prod et le dev ensemble).

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

export const FILES_KEY = "files"; // tous les fichiers du déploiement
export const chunksKey = (scope: string): string => `chunks:${scope}`; // l'historique d'un scope
const READY_KEY = "ready"; // posé par le premier recompte : avant lui, un compteur ne compte que ce qui s'est passé depuis son premier ajout

export async function addUsage(ctx: Pick<MutationCtx, "db">, key: string, bytes: number, count: number) {
  const known = await ctx.db
    .query("storageUsage")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!known)
    return ctx.db.insert("storageUsage", { key, bytes: Math.max(0, bytes), count: Math.max(0, count) });
  return ctx.db.patch(known._id, {
    bytes: Math.max(0, known.bytes + bytes),
    count: Math.max(0, known.count + count),
  });
}

// Un fichier de moins : il part, et se décompte, quand plus aucune ligne de sauvegarde ne le désigne. Un fichier déjà parti ne
// fait pas échouer le lot.
export async function releaseFile(
  ctx: Pick<MutationCtx, "db" | "storage">,
  storageId: Id<"_storage">,
  size: number,
) {
  const stillUsed = await ctx.db
    .query("snapshots")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (stillUsed) return;
  if (await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
  await addUsage(ctx, FILES_KEY, -size, -1);
}

// Une ligne de sauvegarde de moins, et son fichier s'il n'a plus de référence.
export async function discardSnapshotRow(ctx: Pick<MutationCtx, "db" | "storage">, row: Doc<"snapshots">) {
  await ctx.db.delete(row._id);
  await releaseFile(ctx, row.storageId, row.size);
}

// Un chunk de moins : sa ligne, son fichier (jamais partagé), et ses octets dans l'historique du scope.
export async function discardChunkRow(ctx: Pick<MutationCtx, "db" | "storage">, row: Doc<"chunks">) {
  await ctx.db.delete(row._id);
  if (await ctx.db.system.get(row.storageId)) await ctx.storage.delete(row.storageId);
  await addUsage(ctx, FILES_KEY, -row.size, -1);
  await addUsage(ctx, chunksKey(row.scope), -row.size, -1);
}

// Le total de l'historique d'un scope : ce que le budget compare à son plafond.
export const chunkBytes = query({
  args: { serviceKey: v.string(), scope: v.string() },
  handler: async (ctx, { serviceKey, scope }) => {
    requireServiceKey(serviceKey);
    const usage = await ctx.db
      .query("storageUsage")
      .withIndex("by_key", (q) => q.eq("key", chunksKey(scope)))
      .first();
    return usage?.bytes ?? 0;
  },
});

const getUsageRow = (ctx: Pick<QueryCtx, "db">, key: string) =>
  ctx.db
    .query("storageUsage")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

// Interne : appelée avec la clé de déploiement (la Capacité de la fenêtre Développeur), jamais avec celle du service.
// `isReady` : avant le premier recompte (`ensure`), le compteur est vide ou partiel : son chiffre n'est pas un stock (Écart §8.1,
// JOURNAL 2026-10-08). Un champ de plus : le web d'avant ne lit que `bytes`.
export const files = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [usage, ready] = await Promise.all([getUsageRow(ctx, FILES_KEY), getUsageRow(ctx, READY_KEY)]);
    return { bytes: usage?.bytes ?? 0, count: usage?.count ?? 0, isReady: ready !== null };
  },
});

// Les compteurs refaits depuis les lignes : un fichier partagé entre plusieurs lignes ne se compte qu'une fois. Un parcours
// entier, pour une seule fois (le premier démarrage d'un worker) ou une réparation.
async function recountAll(ctx: MutationCtx): Promise<{ files: number; bytes: number }> {
  const sizes = new Map<string, number>();
  const chunkTotals = new Map<string, { bytes: number; count: number }>();
  for (const row of await ctx.db.query("snapshots").collect()) sizes.set(row.storageId, row.size);
  for (const row of await ctx.db.query("chunks").collect()) {
    sizes.set(row.storageId, row.size);
    const total = chunkTotals.get(row.scope) ?? { bytes: 0, count: 0 };
    chunkTotals.set(row.scope, { bytes: total.bytes + row.size, count: total.count + 1 });
  }
  for (const usage of await ctx.db.query("storageUsage").collect()) await ctx.db.delete(usage._id);
  const bytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  await ctx.db.insert("storageUsage", { key: READY_KEY, bytes: 0, count: 0 });
  await ctx.db.insert("storageUsage", { key: FILES_KEY, bytes, count: sizes.size });
  for (const [scope, total] of chunkTotals)
    await ctx.db.insert("storageUsage", { key: chunksKey(scope), ...total });
  return { files: sizes.size, bytes };
}

// `npx convex run usage:recount` : la réparation à la main, et la vérification d'une preuve.
export const recount = internalMutation({ args: {}, handler: (ctx) => recountAll(ctx) });

// Le worker l'appelle à son démarrage : les compteurs d'un déploiement d'avant la rétention se font une fois. Un worker d'avant
// ajoute déjà ses fichiers aux compteurs : seul `ready` dit qu'ils sont complets.
export const ensure = mutation({
  args: { serviceKey: v.string() },
  handler: async (ctx, { serviceKey }) => {
    requireServiceKey(serviceKey);
    const known = await ctx.db
      .query("storageUsage")
      .withIndex("by_key", (q) => q.eq("key", READY_KEY))
      .first();
    if (known) return { isRecounted: false as const };
    return { isRecounted: true as const, ...(await recountAll(ctx)) };
  },
});
