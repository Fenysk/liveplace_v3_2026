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
  // Écart §8.1 (JOURNAL 2026-09-27) : l'e-mail à chaque connexion, le lien de découverte à la création seulement.
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
