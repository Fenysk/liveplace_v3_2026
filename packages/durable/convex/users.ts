// Les comptes (§8.2) : écrits par le web au callback OAuth, lus par le loader de `/{login}`.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { mutation, query } from "./_generated/server";

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
      const { login, displayName, avatarUrl } = user;
      await ctx.db.patch(existing._id, {
        login,
        displayName,
        avatarUrl,
        ...(email ? { email } : {}),
        lastSignInAt: now,
      });
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

// Écart §7.2 (JOURNAL 2026-10-08) : le miroir `user:<id>` de ces personnes, perdu avec Redis. Jamais l'e-mail. Une lecture par
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
