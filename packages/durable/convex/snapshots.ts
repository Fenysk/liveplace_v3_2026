// Les snapshots d'un canvas (§8.2, Écart §8.1 JOURNAL 2026-10-06) : un fichier par snapshot, une ligne d'index.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { isOutdated, SNAPSHOTS_KEPT } from "../src/snapshot-order";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { snapshotTier } from "./schema";
import { addUsage, discardSnapshotRow, FILES_KEY, releaseFile } from "./usage";

const BY_CANVAS_TIER = "by_scope_canvas_tier_takenAt";
const promotedTier = v.union(v.literal("hourly"), v.literal("daily"), v.literal("weekly"));

// La ligne d'un palier à une date : elle se nomme ainsi (palier, date), jamais par son identifiant.
const getRow = (
  ctx: QueryCtx | MutationCtx,
  scope: string,
  canvasId: string,
  tier: Doc<"snapshots">["tier"],
  takenAt: number,
) =>
  ctx.db
    .query("snapshots")
    .withIndex(BY_CANVAS_TIER, (q) =>
      q.eq("scope", scope).eq("canvasId", canvasId).eq("tier", tier).eq("takenAt", takenAt),
    )
    .first();

// L'envoi du fichier ne passe pas par une fonction : le worker le poste à cette adresse, puis `record` le range.
export const generateUploadUrl = mutation({
  args: { serviceKey: v.string() },
  handler: async (ctx, { serviceKey }) => {
    requireServiceKey(serviceKey);
    return ctx.storage.generateUploadUrl();
  },
});

// Une mutation est une transaction : deux workers qui rangent le même canvas ne laissent pas trois lignes.
// Refusé, le fichier envoyé part avec : rien n'y renvoie.
export const record = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    tier: snapshotTier,
    version: v.number(),
    takenAt: v.number(),
    schemaVersion: v.number(),
    size: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { serviceKey, ...incoming }) => {
    requireServiceKey(serviceKey);
    const known = await ctx.db
      .query("snapshots")
      .withIndex(BY_CANVAS_TIER, (q) =>
        q.eq("scope", incoming.scope).eq("canvasId", incoming.canvasId).eq("tier", incoming.tier),
      )
      .order("desc")
      .collect();
    if (isOutdated(incoming, known[0])) {
      await ctx.storage.delete(incoming.storageId);
      return "refused" as const;
    }
    await ctx.db.insert("snapshots", incoming);
    await addUsage(ctx, FILES_KEY, incoming.size, 1);
    // Un fichier que les paliers partagent reste tant qu'une ligne le désigne.
    for (const outdated of known.slice(SNAPSHOTS_KEPT - 1)) await discardSnapshotRow(ctx, outdated);
    return "stored" as const;
  },
});

// Le canvas qui suit `afterCanvasId` dans le scope, par un saut d'index : jamais un parcours des lignes de tous les paliers.
const getNextCanvasId = async (
  ctx: QueryCtx,
  scope: string,
  afterCanvasId: string,
): Promise<string | null> => {
  const next = await ctx.db
    .query("snapshots")
    .withIndex(BY_CANVAS_TIER, (q) => q.eq("scope", scope).gt("canvasId", afterCanvasId))
    .first();
  return next?.canvasId ?? null;
};

// Le dernier snapshot de chaque canvas pour un palier : ce que le worker compare à Redis quand il démarre. Un saut d'index d'un
// canvas au suivant et une lecture à l'envers : deux lignes par canvas, quel que soit le nombre de paliers (JOURNAL 2026-10-08).
export const listLatest = query({
  args: { serviceKey: v.string(), scope: v.string(), tier: snapshotTier },
  handler: async (ctx, { serviceKey, scope, tier }) => {
    requireServiceKey(serviceKey);
    const latest: { canvasId: string; version: number; takenAt: number }[] = [];
    for (let canvasId = await getNextCanvasId(ctx, scope, ""); canvasId !== null; ) {
      const row = await ctx.db
        .query("snapshots")
        .withIndex(BY_CANVAS_TIER, (q) =>
          q
            .eq("scope", scope)
            .eq("canvasId", canvasId as string)
            .eq("tier", tier),
        )
        .order("desc")
        .first();
      if (row) latest.push({ canvasId: row.canvasId, version: row.version, takenAt: row.takenAt });
      canvasId = await getNextCanvasId(ctx, scope, canvasId);
    }
    return latest;
  },
});

// Les lignes des paliers de quelques canvas à la suite de `afterCanvasId` : le worker les lit une fois, à son démarrage, puis
// les tient en mémoire. `next` : où reprendre, `null` quand il n'y en a plus.
export const listTiers = query({
  args: { serviceKey: v.string(), scope: v.string(), afterCanvasId: v.string(), maxCanvases: v.number() },
  handler: async (ctx, { serviceKey, scope, afterCanvasId, maxCanvases }) => {
    requireServiceKey(serviceKey);
    const canvases: {
      canvasId: string;
      rows: {
        tier: "working" | "hourly" | "daily" | "weekly";
        version: number;
        takenAt: number;
        isStateOnly: boolean;
      }[];
    }[] = [];
    let cursor = afterCanvasId;
    for (let canvasId = await getNextCanvasId(ctx, scope, cursor); canvasId !== null; ) {
      const rows = await ctx.db
        .query("snapshots")
        .withIndex(BY_CANVAS_TIER, (q) => q.eq("scope", scope).eq("canvasId", canvasId as string))
        .collect();
      canvases.push({
        canvasId,
        rows: rows.map(({ tier, version, takenAt, isStateOnly }) => ({
          tier,
          version,
          takenAt,
          isStateOnly: isStateOnly ?? false,
        })),
      });
      cursor = canvasId;
      if (canvases.length >= maxCanvases) return { canvases, next: cursor };
      canvasId = await getNextCanvasId(ctx, scope, cursor);
    }
    return { canvases, next: null };
  },
});

// L'adresse du fichier d'une ligne : lue pour le dégrader, ou pour en tirer un `weekly` en `state` seul.
export const getFile = query({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    tier: snapshotTier,
    takenAt: v.number(),
  },
  handler: async (ctx, { serviceKey, scope, canvasId, tier, takenAt }) => {
    requireServiceKey(serviceKey);
    const row = await getRow(ctx, scope, canvasId, tier, takenAt);
    if (!row) return null;
    return { isStateOnly: row.isStateOnly ?? false, url: await ctx.storage.getUrl(row.storageId) };
  },
});

// Une promotion ajoute une ligne au palier, qui partage le fichier de sa source : aucun octet ne bouge. Rejouée, elle ne fait rien.
export const promote = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    fromTier: snapshotTier,
    fromTakenAt: v.number(),
    toTier: promotedTier,
  },
  handler: async (ctx, { serviceKey, scope, canvasId, fromTier, fromTakenAt, toTier }) => {
    requireServiceKey(serviceKey);
    const source = await getRow(ctx, scope, canvasId, fromTier, fromTakenAt);
    if (!source) return "missing" as const;
    if (await getRow(ctx, scope, canvasId, toTier, source.takenAt)) return "exists" as const;
    const { _id, _creationTime, ...copy } = source;
    await ctx.db.insert("snapshots", { ...copy, tier: toTier });
    return "promoted" as const;
  },
});

// Un palier tiré d'une sauvegarde complète en `state` seul : un fichier neuf, plus petit, dont la ligne est ajoutée.
export const storeStateOnly = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    tier: promotedTier,
    version: v.number(),
    takenAt: v.number(),
    schemaVersion: v.number(),
    size: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { serviceKey, ...incoming }) => {
    requireServiceKey(serviceKey);
    if (await getRow(ctx, incoming.scope, incoming.canvasId, incoming.tier, incoming.takenAt)) {
      await ctx.storage.delete(incoming.storageId);
      return "exists" as const;
    }
    await ctx.db.insert("snapshots", { ...incoming, isStateOnly: true });
    await addUsage(ctx, FILES_KEY, incoming.size, 1);
    return "stored" as const;
  },
});

// La ligne passe à un fichier plus petit, en `state` seul ; l'ancien part avec elle s'il n'a plus de référence.
export const degrade = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    tier: snapshotTier,
    takenAt: v.number(),
    size: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { serviceKey, scope, canvasId, tier, takenAt, size, storageId }) => {
    requireServiceKey(serviceKey);
    const row = await getRow(ctx, scope, canvasId, tier, takenAt);
    if (!row || row.isStateOnly) {
      await ctx.storage.delete(storageId);
      return row ? ("degraded" as const) : ("missing" as const);
    }
    await ctx.db.patch(row._id, { storageId, size, isStateOnly: true });
    await addUsage(ctx, FILES_KEY, size, 1);
    await releaseFile(ctx, row.storageId, row.size);
    return "degraded" as const;
  },
});

// Une ligne de palier qui sort de sa durée : elle part, son fichier avec s'il n'a plus de référence.
export const discard = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.string(),
    canvasId: v.string(),
    tier: snapshotTier,
    takenAt: v.number(),
  },
  handler: async (ctx, { serviceKey, scope, canvasId, tier, takenAt }) => {
    requireServiceKey(serviceKey);
    const row = await getRow(ctx, scope, canvasId, tier, takenAt);
    if (!row) return "missing" as const;
    await discardSnapshotRow(ctx, row);
    return "discarded" as const;
  },
});

export const getLatest = query({
  args: { serviceKey: v.string(), scope: v.string(), canvasId: v.string(), tier: snapshotTier },
  handler: async (ctx, { serviceKey, scope, canvasId, tier }) => {
    requireServiceKey(serviceKey);
    const latest = await ctx.db
      .query("snapshots")
      .withIndex(BY_CANVAS_TIER, (q) => q.eq("scope", scope).eq("canvasId", canvasId).eq("tier", tier))
      .order("desc")
      .first();
    if (!latest) return null;
    const { version, takenAt, schemaVersion } = latest;
    return { version, takenAt, schemaVersion, url: await ctx.storage.getUrl(latest.storageId) };
  },
});

// Écart §7.2 (JOURNAL 2026-10-08) : ce scope garde-t-il une sauvegarde de ce canvas ? La connexion du streamer ne le recrée
// pas vide si oui. Un seul index, `first()`.
export const has = query({
  args: { serviceKey: v.string(), scope: v.string(), canvasId: v.string() },
  handler: async (ctx, { serviceKey, scope, canvasId }) => {
    requireServiceKey(serviceKey);
    const found = await ctx.db
      .query("snapshots")
      .withIndex(BY_CANVAS_TIER, (q) => q.eq("scope", scope).eq("canvasId", canvasId))
      .first();
    return found !== null;
  },
});

// Les deux dernières sauvegardes d'un palier, de la plus récente à la plus ancienne : la récupération prend la précédente si
// la dernière est illisible. Leur adresse seulement, le fichier ne se lit que si on en a besoin.
export const listRecent = query({
  args: { serviceKey: v.string(), scope: v.string(), canvasId: v.string(), tier: snapshotTier },
  handler: async (ctx, { serviceKey, scope, canvasId, tier }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("snapshots")
      .withIndex(BY_CANVAS_TIER, (q) => q.eq("scope", scope).eq("canvasId", canvasId).eq("tier", tier))
      .order("desc")
      .take(SNAPSHOTS_KEPT);
    return Promise.all(
      rows.map(async ({ version, takenAt, schemaVersion, storageId }) => ({
        version,
        takenAt,
        schemaVersion,
        url: await ctx.storage.getUrl(storageId),
      })),
    );
  },
});
