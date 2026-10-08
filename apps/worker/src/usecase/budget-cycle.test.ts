import type { BudgetStore } from "@liveplace/domain/ports";
import { type ChunkSize, DAY_MS, HISTORY_FLOOR_MS, historyBudgetBytes } from "@liveplace/domain/retention";
import { describe, expect, it } from "vitest";
import { createBudgetCycle } from "./budget-cycle";

const MB = 1024 * 1024;
const HOUR_MS = 3_600_000;
const NOW = Date.UTC(2026, 9, 8, 12);
const LONG_AGO = NOW - 20 * DAY_MS;

// `n` chunks de 1 Mo pour un canvas, un par heure à partir de `from`, de plus en plus récents.
const chunks = (canvasId: string, count: number, from: number, firstVersion = 1): ChunkSize[] =>
  Array.from({ length: count }, (_, index) => ({
    canvasId,
    fromVersion: firstVersion + index * 10,
    toVersion: firstVersion + index * 10 + 9,
    toTs: from + index * HOUR_MS,
    size: MB,
  }));

// Convex en mémoire : un total qui suit les chunks, le plus ancien d'abord, et un lot qui s'arrête au plancher.
function createFakeConvex(initial: ChunkSize[]) {
  let kept = [...initial];
  const calls: string[] = [];
  const batches: number[] = [];
  const state = { failPurges: 0, onPurge: (): void => undefined, isRecounted: false };

  const store: BudgetStore = {
    async ensureUsage() {
      calls.push("ensureUsage");
      return { isRecounted: state.isRecounted };
    },
    async getHistoryBytes() {
      calls.push("getHistoryBytes");
      return kept.reduce((sum, { size }) => sum + size, 0);
    },
    async listOldestChunks(limit) {
      calls.push("listOldestChunks");
      return [...kept].sort((first, second) => first.toTs - second.toTs).slice(0, limit);
    },
    async purgeChunks(canvasId, beforeVersion, floorTs, maxChunks) {
      calls.push("purgeChunks");
      state.onPurge();
      if (state.failPurges > 0) {
        state.failPurges -= 1;
        throw new Error("Convex injoignable");
      }
      const prefix = kept
        .filter((chunk) => chunk.canvasId === canvasId)
        .sort((first, second) => first.fromVersion - second.fromVersion)
        .slice(0, maxChunks);
      const taken: ChunkSize[] = [];
      for (const chunk of prefix) {
        if (chunk.toVersion >= beforeVersion || chunk.toTs >= floorTs) break;
        taken.push(chunk);
      }
      kept = kept.filter((chunk) => !taken.includes(chunk));
      batches.push(taken.length);
      return { removed: taken.length, bytes: taken.length * MB, isDone: taken.length < maxChunks };
    },
  };

  return {
    store,
    calls,
    batches,
    state,
    total: () => kept.reduce((sum, { size }) => sum + size, 0),
    oldestKept: () => Math.min(...kept.map(({ toTs }) => toTs)),
    count: (canvasId: string) => kept.filter((chunk) => chunk.canvasId === canvasId).length,
  };
}

function setup(scope: string, initial: ChunkSize[]) {
  const convex = createFakeConvex(initial);
  const clock = { now: NOW };
  const logs: string[] = [];
  const cycle = createBudgetCycle({
    store: convex.store,
    budgetBytes: historyBudgetBytes(scope),
    now: () => clock.now,
    log: (message) => logs.push(message),
  });
  return { ...convex, cycle, clock, logs };
}

describe("the history budget cycle (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Sous le budget, rien n'est lu au-delà du total, rien ne part
  it("purges nothing under the budget", async () => {
    const { cycle, calls, total } = setup("poste-2", chunks("a", 40, LONG_AGO));

    await cycle.tick();

    expect(calls).toEqual(["getHistoryBytes"]);
    expect(total()).toBe(40 * MB);
  });

  // Au-dessus de 50 Mo hors prod, le plus ancien part le premier, canvas confondus, jusqu'à revenir au budget
  it("purges the oldest first across canvases until back to the budget", async () => {
    const { cycle, total, count, oldestKept } = setup("poste-2", [
      ...chunks("a", 30, LONG_AGO),
      ...chunks("b", 30, LONG_AGO + 30 * 60_000), // intercalés avec ceux de a, une demi-heure plus tard
    ]);

    await cycle.tick();

    expect(total()).toBe(50 * MB);
    expect(count("a") + count("b")).toBe(50);
    // 10 chunks sont partis : les 5 plus anciens de chaque canvas, le plus ancien conservé est le 6e de a
    expect(count("a")).toBe(25);
    expect(oldestKept()).toBe(LONG_AGO + 5 * HOUR_MS);
  });

  // La prod a 700 Mo : la même quantité y tient sans rien retirer
  it("gives the prod scope a budget of 700 MB", async () => {
    const { cycle, total } = setup("prod", chunks("a", 60, LONG_AGO));

    await cycle.tick();

    expect(total()).toBe(60 * MB);
  });

  // Jamais sous 7 jours d'historique : dépassé le budget, le plancher l'emporte, et la passe ne se rejoue pas à chaque tour
  it("never goes under seven days of history, and waits instead of asking again at once", async () => {
    const recent = NOW - HISTORY_FLOOR_MS + HOUR_MS;
    const { cycle, clock, calls, total } = setup("poste-2", chunks("a", 60, recent));

    await cycle.tick();
    const asked = calls.length;
    clock.now += 250;
    await cycle.tick();

    expect(total()).toBe(60 * MB);
    expect(calls.slice(asked)).toEqual([]);
  });

  // Les chunks partent par lots de 50 : une transaction reste petite, la plage de 70 chunks en demande deux
  it("removes a range by batches of fifty chunks", async () => {
    const { cycle, batches, total } = setup("poste-2", chunks("a", 120, LONG_AGO));

    await cycle.tick();

    expect(batches.slice(0, 2)).toEqual([50, 20]);
    expect(total()).toBe(50 * MB);
  });

  // Une passe qui ne retire que 200 chunks est relue aussitôt, jusqu'au budget
  it("reads the total again straight after a purge until the budget is met", async () => {
    const { cycle, total } = setup("poste-2", chunks("a", 300, LONG_AGO));

    await cycle.tick(); // 200 chunks, la page lue
    expect(total()).toBe(100 * MB);

    await cycle.tick(); // le reste
    expect(total()).toBe(50 * MB);
  });

  // Un tour rend la main passé son budget ; la plage décidée reprend au tour suivant, sans relire les chunks
  it("hands back control after its time budget and carries on with the same ranges", async () => {
    const { cycle, clock, state, calls, total } = setup("poste-2", chunks("a", 120, LONG_AGO));
    state.onPurge = () => {
      clock.now += 6_000; // chaque lot prend 6 s
    };

    await cycle.tick();

    expect(total()).toBe(70 * MB);
    const listed = calls.filter((call) => call === "listOldestChunks").length;

    await cycle.tick();

    expect(total()).toBe(50 * MB);
    expect(calls.filter((call) => call === "listOldestChunks")).toHaveLength(listed);
  });

  // Un échec de Convex se journalise, la passe est abandonnée et reprise une minute plus tard
  it("logs a failure and tries again a minute later", async () => {
    const { cycle, clock, state, logs, total } = setup("poste-2", chunks("a", 60, LONG_AGO));
    state.failPurges = 1;

    await cycle.tick();

    expect(logs).toEqual(["budget de l'historique échoué"]);
    expect(total()).toBe(60 * MB);

    clock.now += 61_000;
    await cycle.tick();

    expect(total()).toBe(50 * MB);
  });

  // Au démarrage, les compteurs d'un déploiement d'avant se font une fois : le worker le dit
  it("reports the first count of the storage counters at start", async () => {
    const { cycle, state, calls, logs } = setup("poste-2", []);
    state.isRecounted = true;

    await cycle.start();

    expect(calls).toEqual(["ensureUsage"]);
    expect(logs).toEqual(["compteurs de stockage Convex recomptés"]);
  });
});
