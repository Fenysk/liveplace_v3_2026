// Les comptes (§8.2) : écrits par le web au callback OAuth, lus par le loader de `/{login}`.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { toUserPatch } from "../src/user-patch";
import { mutation, query } from "./_generated/server";
import { accountDeletionTrigger } from "./schema";

const DETACHED_PER_CALL = 200; // des comptes venus de sa page par appel : une transaction reste petite

export const upsertFromTwitch = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    login: v.string(),
    displayName: v.string(),
    avatarUrl: v.string(),
    email: v.optional(v.string()),
    discoveredViaUserId: v.optional(v.string()),
  },
  // §8.1 : l'e-mail à chaque connexion, le lien de découverte à la création seulement.
  handler: async (ctx, { serviceKey, email, discoveredViaUserId, ...user }) => {
    requireServiceKey(serviceKey);
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .unique();
    if (existing) {
      // Sans e-mail dans ce jeton, celui d'avant part : la réduction de portée (contrat Twitch VI.F).
      await ctx.db.patch(existing._id, toUserPatch({ ...user, email: email || undefined }, now));
      return;
    }
    await ctx.db.insert("users", {
      ...user,
      ...(email ? { email } : {}),
      ...(discoveredViaUserId ? { discoveredViaUserId } : {}),
      createdAt: now,
      lastSignInAt: now,
    });
  },
});

export const getByLogin = query({
  args: { serviceKey: v.string(), login: v.string() },
  handler: async (ctx, { serviceKey, login }) => {
    requireServiceKey(serviceKey);
    const users = await ctx.db
      .query("users")
      .withIndex("by_login", (q) => q.eq("login", login))
      .collect();
    // Un pseudo libéré chez Twitch peut être repris : le plus récemment connecté l'emporte.
    const [latest] = users.sort((a, b) => b.lastSignInAt - a.lastSignInAt);
    if (!latest) return null;
    return {
      userId: latest.userId,
      login: latest.login,
      displayName: latest.displayName,
      avatarUrl: latest.avatarUrl,
    };
  },
});

// §7.4 : le miroir `user:<id>` de ces personnes, perdu avec Redis. Jamais l'e-mail. Une lecture par
// identifiant dans une seule requête : la récupération en demande par lots, et seulement pour un canvas à remettre.
export const listByUserIds = query({
  args: { serviceKey: v.string(), userIds: v.array(v.string()) },
  handler: async (ctx, { serviceKey, userIds }) => {
    requireServiceKey(serviceKey);
    const found = await Promise.all(
      userIds.map((userId) =>
        ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .first(),
      ),
    );
    return found.flatMap((user) =>
      user
        ? [
            {
              userId: user.userId,
              login: user.login,
              displayName: user.displayName,
              ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            },
          ]
        : [],
    );
  },
});

// CDC §8, Supprimer son compte : la ligne du compte, e-mail compris, et la preuve de son effacement dans la même
// transaction (RGPD art. 5.2), par `runId` : une reprise qui repasse ici ne double rien. Rend ce qu'il faut pour oublier
// ses caches ; `null` : la ligne était déjà partie.
export const deleteByUserId = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    runId: v.string(),
    deletedAt: v.number(),
    trigger: accountDeletionTrigger,
    ownedCanvases: v.number(),
  },
  handler: async (ctx, { serviceKey, userId, runId, deletedAt, trigger, ownedCanvases }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    const proven = await ctx.db
      .query("accountDeletions")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first();
    if (!proven)
      await ctx.db.insert("accountDeletions", {
        runId,
        deletedAt,
        trigger,
        erased: { hasEmail: rows.some(({ email }) => email !== undefined), ownedCanvases },
      });
    const [first] = rows;
    return first ? { login: first.login, avatarUrl: first.avatarUrl } : null;
  },
});

// Les comptes venus de la page de ce streamer ne le nomment plus. Par lots de `DETACHED_PER_CALL` : le client rappelle tant
// qu'il en reste.
export const detachDiscovered = mutation({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, { serviceKey, userId }) => {
    requireServiceKey(serviceKey);
    const rows = await ctx.db
      .query("users")
      .withIndex("by_discoveredVia", (q) => q.eq("discoveredViaUserId", userId))
      .take(DETACHED_PER_CALL);
    for (const row of rows) await ctx.db.patch(row._id, { discoveredViaUserId: undefined });
    return rows.length;
  },
});
