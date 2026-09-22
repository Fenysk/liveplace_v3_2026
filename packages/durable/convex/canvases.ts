// Les canvas d'un propriétaire (§8.2, D-14) : un seul actif en bloc 1, créé à l'inscription.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { mutation, type QueryCtx, query } from "./_generated/server";

const activeCanvasOf = (db: QueryCtx["db"], ownerId: string) =>
  db
    .query("canvases")
    .withIndex("by_owner_active", (q) => q.eq("ownerId", ownerId).eq("isActive", true))
    .first();

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
