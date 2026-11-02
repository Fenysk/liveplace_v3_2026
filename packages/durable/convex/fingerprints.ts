// CDC §8, Supprimer son compte (JOURNAL 2026-11-02) : les empreintes de session des comptes supprimés. Redis les garde 31 jours ; ici
// elles survivent à une perte de Redis, et le web les y remet. Jamais un identifiant.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { mutation } from "./_generated/server";

const MARKS_MAX = 1000; // des comptes supprimés en 31 jours : bien au-delà de ce qu'un mois de suppressions en demande
const PRUNED_PER_CALL = 100; // une transaction reste petite

// Idempotent : la routine reprise repasse ici avec la même empreinte.
export const keep = mutation({
  args: { serviceKey: v.string(), fingerprint: v.string(), deletedAt: v.number() },
  handler: async (ctx, { serviceKey, fingerprint, deletedAt }) => {
    requireServiceKey(serviceKey);
    const known = await ctx.db
      .query("deletedAccounts")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .first();
    if (!known) await ctx.db.insert("deletedAccounts", { fingerprint, deletedAt });
  },
});

// Les empreintes d'au plus 31 jours (`since` : l'instant le plus ancien gardé). Celles d'avant ne refusent plus aucun jeton :
// elles partent ici, par lots.
export const sync = mutation({
  args: { serviceKey: v.string(), since: v.number() },
  handler: async (ctx, { serviceKey, since }) => {
    requireServiceKey(serviceKey);
    const expired = await ctx.db
      .query("deletedAccounts")
      .withIndex("by_deletedAt", (q) => q.lt("deletedAt", since))
      .take(PRUNED_PER_CALL);
    for (const row of expired) await ctx.db.delete(row._id);
    const kept = await ctx.db
      .query("deletedAccounts")
      .withIndex("by_deletedAt", (q) => q.gte("deletedAt", since))
      .take(MARKS_MAX);
    return kept.map(({ fingerprint, deletedAt }) => ({ fingerprint, deletedAt }));
  },
});
