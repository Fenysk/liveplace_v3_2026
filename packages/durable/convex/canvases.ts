// Les canvas d'un propriétaire (§8.2, D-14) : un actif, créé à l'inscription, et ses archives (Écart §15, JOURNAL 2026-10-06).

import { v } from "convex/values";
import {
  type CanvasWrite,
  type Plan,
  pickLinkedCanvas,
  planArchive,
  planDiscard,
  planRename,
  planReopen,
  toOwnerCanvases,
} from "../src/canvas-plan";
import { requireServiceKey } from "../src/service-key";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";

const activeCanvasOf = (db: QueryCtx["db"], ownerId: string) =>
  db
    .query("canvases")
    .withIndex("by_owner_active", (q) => q.eq("ownerId", ownerId).eq("isActive", true))
    .first();

// Tous les canvas du propriétaire, l'actif et les archives : cinq archives au plus, donc six documents.
const canvasesOf = (db: QueryCtx["db"], ownerId: string) =>
  db
    .query("canvases")
    .withIndex("by_owner_active", (q) => q.eq("ownerId", ownerId))
    .collect();

type OwnerCanvasDocs = Awaited<ReturnType<typeof canvasesOf>>;

// Les écritures d'un plan, dans la transaction de la mutation qui l'a calculé.
const applyWrites = async (db: MutationCtx["db"], docs: OwnerCanvasDocs, writes: readonly CanvasWrite[]) => {
  for (const write of writes) {
    if (write.kind === "insert") {
      await db.insert("canvases", write.canvas);
      continue;
    }
    const doc = docs.find((candidate) => candidate.canvasId === write.canvasId);
    if (!doc) throw new Error(`canvas ${write.canvasId} absent du plan`);
    if (write.kind === "delete") await db.delete(doc._id);
    else await db.patch(doc._id, write.fields);
  }
};

// Un refus est une valeur, pas une exception : Convex cache le message d'une exception au client.
const settle = async <Refusal extends string>(
  db: MutationCtx["db"],
  docs: OwnerCanvasDocs,
  plan: Plan<Refusal>,
) => {
  if (!plan.ok) return plan;
  await applyWrites(db, docs, plan.writes);
  return { ok: true as const };
};

// Une mutation est une transaction : deux premières connexions simultanées ne créent pas deux canvas.
export const ensureForOwner = mutation({
  args: {
    serviceKey: v.string(),
    ownerId: v.string(),
    canvasId: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, { serviceKey, ...candidate }) => {
    requireServiceKey(serviceKey);
    const active = await activeCanvasOf(ctx.db, candidate.ownerId);
    if (active) return active.canvasId;
    await ctx.db.insert("canvases", {
      ...candidate,
      isActive: true,
      createdAt: Date.now(),
      purgedBeforeVersion: 0,
      purgedBeforeTs: 0,
    });
    return candidate.canvasId;
  },
});

export const getActiveForOwner = query({
  args: { serviceKey: v.string(), ownerId: v.string() },
  handler: async (ctx, { serviceKey, ownerId }) => {
    requireServiceKey(serviceKey);
    const active = await activeCanvasOf(ctx.db, ownerId);
    if (!active) return null;
    return { canvasId: active.canvasId, width: active.width, height: active.height };
  },
});

export const listForOwner = query({
  args: { serviceKey: v.string(), ownerId: v.string() },
  handler: async (ctx, { serviceKey, ownerId }) => {
    requireServiceKey(serviceKey);
    return toOwnerCanvases(await canvasesOf(ctx.db, ownerId));
  },
});

// Sans session : le code du lien suffit à voir une archive. Le propriétaire vient du pseudo de l'URL.
export const getByLinkCode = query({
  args: { serviceKey: v.string(), ownerId: v.string(), linkCode: v.string() },
  handler: async (ctx, { serviceKey, ownerId, linkCode }) => {
    requireServiceKey(serviceKey);
    return pickLinkedCanvas(await canvasesOf(ctx.db, ownerId), linkCode);
  },
});

// Le plafond d'archives vient de l'appelant (une seule source : le domaine), mais c'est ici qu'il se vérifie.
export const archiveActive = mutation({
  args: {
    serviceKey: v.string(),
    ownerId: v.string(),
    outgoingId: v.string(),
    incomingId: v.string(),
    width: v.number(),
    height: v.number(),
    archivedAt: v.number(),
    linkCode: v.string(),
    name: v.optional(v.string()),
    maxArchives: v.number(),
  },
  handler: async (ctx, { serviceKey, incomingId, width, height, ...input }) => {
    requireServiceKey(serviceKey);
    const docs = await canvasesOf(ctx.db, input.ownerId);
    return settle(
      ctx.db,
      docs,
      planArchive(docs, { ...input, incoming: { canvasId: incomingId, width, height } }),
    );
  },
});

export const reopen = mutation({
  args: {
    serviceKey: v.string(),
    ownerId: v.string(),
    outgoingId: v.string(),
    reopenedId: v.string(),
    archivedAt: v.number(),
    linkCode: v.string(),
  },
  handler: async (ctx, { serviceKey, ...input }) => {
    requireServiceKey(serviceKey);
    const docs = await canvasesOf(ctx.db, input.ownerId);
    return settle(ctx.db, docs, planReopen(docs, input));
  },
});

// Sans `name`, le canvas n'en a plus : le patch retire le champ.
export const rename = mutation({
  args: { serviceKey: v.string(), ownerId: v.string(), canvasId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { serviceKey, ownerId, canvasId, name }) => {
    requireServiceKey(serviceKey);
    const docs = await canvasesOf(ctx.db, ownerId);
    return settle(ctx.db, docs, planRename(docs, ownerId, canvasId, name));
  },
});

export const discard = mutation({
  args: { serviceKey: v.string(), ownerId: v.string(), canvasId: v.string() },
  handler: async (ctx, { serviceKey, ownerId, canvasId }) => {
    requireServiceKey(serviceKey);
    const docs = await canvasesOf(ctx.db, ownerId);
    return settle(ctx.db, docs, planDiscard(docs, ownerId, canvasId));
  },
});
