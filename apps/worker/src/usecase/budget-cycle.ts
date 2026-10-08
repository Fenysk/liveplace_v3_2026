// Le budget de l'historique fin (Écart §8.1, JOURNAL 2026-10-08) : 700 Mo pour la prod, 50 Mo ailleurs. Au-delà, le plus ancien
// part le premier, canvas confondus, sans jamais descendre sous 7 jours d'historique. Le total vient d'un compteur de Convex ; le
// curseur de chaque canvas avance avec chaque lot retiré, donc un worker arrêté au milieu reprend là où il en était.

import type { BudgetStore } from "@liveplace/domain/ports";
import { HISTORY_FLOOR_MS, type PurgeRange, purgeableRanges } from "@liveplace/domain/retention";

const CHECK_MS = 5 * 60_000; // le total d'un scope ne grossit pas assez vite pour être relu plus souvent
const RETRY_MS = 60_000;
const PAGE_CHUNKS = 200; // les plus anciens lus en une fois : ce qu'une passe peut retirer, le reste suit à la passe d'après
const BATCH_CHUNKS = 50; // une transaction Convex reste petite
const TICK_BUDGET_MS = 5_000; // un tour rend la main au bail et aux autres cycles

export type BudgetCycleDeps = {
  store: BudgetStore;
  budgetBytes: number; // celui du scope (`historyBudgetBytes`), donné par l'appelant : une preuve en pose un petit
  now(): number;
  log(message: string, error?: unknown): void;
};

export function createBudgetCycle({ store, budgetBytes, now, log }: BudgetCycleDeps) {
  let pending: PurgeRange[] = []; // les plages décidées par la passe en cours, retirées par lots d'un tour à l'autre
  let removedInPass = 0;
  let nextCheckAt = 0;

  // Au-dessus du budget, la passe suivante est immédiate tant qu'elle retire quelque chose : le total est relu jusqu'au budget.
  const decide = async (nowMs: number): Promise<void> => {
    const total = await store.getHistoryBytes();
    pending =
      total > budgetBytes
        ? purgeableRanges(await store.listOldestChunks(PAGE_CHUNKS), total, budgetBytes, nowMs)
        : [];
    removedInPass = 0;
    nextCheckAt = nowMs + (pending.length > 0 ? 0 : CHECK_MS);
  };

  // Retire les plages décidées, lot par lot. Faux : le budget du tour est épuisé, le reste suit au tour d'après.
  const drain = async (startedAt: number): Promise<boolean> => {
    for (let range = pending[0]; range; range = pending[0]) {
      const { removed, isDone } = await store.purgeChunks(
        range.canvasId,
        range.beforeVersion,
        startedAt - HISTORY_FLOOR_MS,
        BATCH_CHUNKS,
      );
      removedInPass += removed;
      if (isDone) pending.shift();
      if (now() - startedAt >= TICK_BUDGET_MS) return false;
    }
    return true;
  };

  return {
    // Les compteurs d'un déploiement d'avant la rétention se font une fois, avant le premier calcul.
    async start(): Promise<void> {
      const { isRecounted } = await store.ensureUsage();
      if (isRecounted) log("compteurs de stockage Convex recomptés");
    },

    async tick(): Promise<void> {
      const startedAt = now();
      try {
        if (pending.length === 0) {
          if (startedAt < nextCheckAt) return;
          await decide(startedAt);
        }
        // Une passe qui n'a rien retiré (le plancher l'en empêche) attend : relire aussitôt donnerait la même réponse.
        if ((await drain(startedAt)) && removedInPass === 0) nextCheckAt = now() + CHECK_MS;
      } catch (error) {
        log("budget de l'historique échoué", error);
        pending = [];
        nextCheckAt = now() + RETRY_MS;
      }
    },
  };
}
