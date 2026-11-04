// Ce que la politique de confidentialité ne laisse pas vivre plus longtemps (JOURNAL 2026-11-04) : un don jamais relié à un compte,
// 12 mois après sa date ; la preuve d'un effacement de compte, 5 ans après lui. L'instant limite vient du worker (le domaine
// compte les mois calendaires, que Convex n'importe pas) ; les fonctions n'ont pas d'horloge.

import { v } from "convex/values";
import { requireServiceKey } from "../src/service-key";
import { type MutationCtx, mutation } from "./_generated/server";

const PURGED_PER_CALL = 100; // une transaction reste petite : le worker rappelle tant qu'il en reste
const UNLINKED_SCANNED_MAX = 500; // les dons en attente lus à chaque appel : bien au-delà de 12 mois de dons jamais reliés

type ExpiryPage = { purged: number; isDone: boolean }; // `ExpiryPage` du domaine, que Convex n'importe pas

// Les dons sans `userId` seuls sont lus : un don relié ne part jamais, et ne rend pas le parcours plus long à mesure que les années
// passent. Les plus anciens à l'enregistrement d'abord, donc les premiers à expirer.
export async function purgeUnlinkedDonations(ctx: MutationCtx, before: number): Promise<ExpiryPage> {
  const waiting = await ctx.db
    .query("donations")
    .withIndex("by_userId", (q) => q.eq("userId", undefined))
    .take(UNLINKED_SCANNED_MAX);
  const expired = waiting.filter(({ donatedAt }) => donatedAt < before);
  const batch = expired.slice(0, PURGED_PER_CALL);
  for (const donation of batch) await ctx.db.delete(donation._id);
  return { purged: batch.length, isDone: expired.length <= PURGED_PER_CALL };
}

export async function purgeDeletionProofs(ctx: MutationCtx, before: number): Promise<ExpiryPage> {
  const expired = await ctx.db
    .query("accountDeletions")
    .withIndex("by_deletedAt", (q) => q.lt("deletedAt", before))
    .take(PURGED_PER_CALL + 1);
  const batch = expired.slice(0, PURGED_PER_CALL);
  for (const proof of batch) await ctx.db.delete(proof._id);
  return { purged: batch.length, isDone: expired.length <= PURGED_PER_CALL };
}

export const donations = mutation({
  args: { serviceKey: v.string(), before: v.number() },
  handler: async (ctx, { serviceKey, before }) => {
    requireServiceKey(serviceKey);
    return purgeUnlinkedDonations(ctx, before);
  },
});

export const deletionProofs = mutation({
  args: { serviceKey: v.string(), before: v.number() },
  handler: async (ctx, { serviceKey, before }) => {
    requireServiceKey(serviceKey);
    return purgeDeletionProofs(ctx, before);
  },
});
