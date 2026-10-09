// Le cycle de l'historique (Écart §7.2, JOURNAL 2026-10-08) : écouter le canal, balayer les versions, ranger ce qui est dû.

import {
  CHUNK_SCHEMA_VERSION,
  type Chunk,
  isFirstAfterRecovery,
  listChunkGaps,
} from "@liveplace/domain/chunk";
import type { HistorySource, HistoryStore, Unsubscribe } from "@liveplace/domain/ports";
import { HISTORY_PENDING_MAX, type HistoryPlan } from "./history-plan";

const TICK_BUDGET_MS = 10_000; // un tour rend la main avant la fin du bail (30 s), même avec des centaines de canvas dus

export type HistoryCycleDeps = {
  source: HistorySource;
  store: HistoryStore;
  plan: HistoryPlan;
  encode(chunk: Chunk): Promise<Uint8Array>;
  now(): number;
  log(message: string, error?: unknown): void;
};

export function createHistoryCycle({ source, store, plan, encode, now, log }: HistoryCycleDeps) {
  // Le curseur de Convex fait foi : au démarrage, et quand il refuse un chevauchement.
  const seedCursors = async (): Promise<void> => plan.seed(await store.listChunkCursors(), now());

  const archiveCanvas = async (canvasId: string): Promise<void> => {
    try {
      const cursor = plan.getCursor(canvasId);
      const upTo = plan.getKnownVersion(canvasId);
      const { entries, resizedAtVersion, recovered } = await source.listHistory(
        canvasId,
        cursor,
        HISTORY_PENDING_MAX,
      );
      const first = entries[0];
      const last = entries.at(-1);
      // Des versions sans entrée seule (une taille) : rien à ranger, et rien à relire avant une version de plus.
      if (!first || !last) return plan.noteChecked(canvasId, upTo, now());

      const [fromVersion, toVersion] = [first[0], last[0]];
      const payload = await encode({
        schemaVersion: CHUNK_SCHEMA_VERSION,
        canvasId,
        fromVersion,
        toVersion,
        entries,
      });
      const answer = await store.storeChunk({
        canvasId,
        fromVersion,
        toVersion,
        fromTs: first[2].occurredAt,
        toTs: last[2].occurredAt,
        count: entries.length,
        schemaVersion: CHUNK_SCHEMA_VERSION,
        // Écart §7.2 (JOURNAL 2026-10-08) : le saut d'une récupération n'est pas un trou, mais le premier chunk d'après la date
        // et note les versions perdues avant elle.
        ...listChunkGaps(
          cursor,
          entries.map(([version]) => version),
          resizedAtVersion,
          recovered,
        ),
        ...(isFirstAfterRecovery(cursor, recovered) ? { recoveredAt: recovered.at } : {}),
        payload,
      });
      if (answer === "overlap") {
        log(`chunk ${canvasId} ${fromVersion}-${toVersion} refusé : Convex garde déjà ces versions`);
        return await seedCursors();
      }
      plan.noteArchived(canvasId, toVersion, now());
    } catch (error) {
      log(`chunk ${canvasId} échoué`, error);
      plan.noteFailed(canvasId, now());
    }
  };

  return {
    // Ce que Convex garde déjà, puis le canal `live` : le worker voit passer chaque version.
    async start(): Promise<Unsubscribe> {
      await seedCursors();
      return source.watch(({ canvasId, status, version }) => {
        if (status === "discarded") return plan.drop(canvasId);
        if (version !== undefined) plan.noteVersion(canvasId, version, now());
      });
    },

    // Le rattrapage : la version de chaque canvas de Redis, pour ce que le worker a manqué.
    async sweep(canvasIds: Iterable<string>): Promise<void> {
      for (const canvasId of canvasIds) {
        const version = await source.getVersion(canvasId);
        if (version === null) continue;
        const recovery = await source.getRecovery(canvasId);
        if (recovery) plan.noteFloor(canvasId, recovery.version, now());
        plan.noteVersion(canvasId, version, now());
      }
    },

    // Un canvas à la fois, et un seul chunk par canvas et par tour.
    async tick(): Promise<void> {
      const startedAt = now();
      for (const canvasId of plan.listDue(startedAt)) {
        if (now() - startedAt >= TICK_BUDGET_MS) return;
        await archiveCanvas(canvasId);
      }
    },
  };
}
