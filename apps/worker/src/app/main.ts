// Le câblage du worker : config, Redis, bail, cycles de sauvegarde, d'historique, de rétention et de budget (§3.3, §7).

import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { historyBudgetBytes } from "@liveplace/domain/retention";
import {
  createBudgetStore,
  createHistoryStore,
  createRecoveryStore,
  createRetentionStore,
  createSnapshotStore,
} from "@liveplace/durable";
import {
  createHistorySource,
  createRecoveryTarget,
  createSnapshotDelayWrites,
  createSnapshotSource,
} from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { encodeChunk } from "../infra/chunk-codec";
import { encodeImage } from "../infra/image-codec";
import { createPresence } from "../infra/presence";
import { decodeSnapshot, encodeSnapshot } from "../infra/snapshot-codec";
import { createBudgetCycle } from "../usecase/budget-cycle";
import { createHistoryCycle } from "../usecase/history-cycle";
import { createHistoryPlan } from "../usecase/history-plan";
import { createRecoveryCycle } from "../usecase/recovery-cycle";
import { createRetentionCycle } from "../usecase/retention-cycle";
import { createSnapshotCycle } from "../usecase/snapshot-cycle";
import { createSnapshotPlan } from "../usecase/snapshot-plan";
import { parseWorkerConfig } from "./config";

const TICK_MS = 250; // la modération doit tenir dans les 2 s : un tour tous les quarts de seconde
const KEEP_MS = 5_000; // le bail dure 30 s : six tentatives pour le prolonger
const SWEEP_MS = 5 * 60_000; // le balayage de rattrapage (Écart §7.2, JOURNAL 2026-10-06)
const DELAY_REPORT_MS = 10_000; // le retard de la sauvegarde, déposé pour la Capacité à sa cadence (Écart §8.1, JOURNAL 2026-10-08)

// Fail-closed : sans une variable obligatoire, le process s'arrête ici en la nommant (§11.5).
const config = parseWorkerConfig(process.env);

const redis = new Redis(config.redisUrl);
const presence = createPresence(redis, randomUUID());

// Un second worker ne démarre pas : deux lectures du même canvas ne servent à rien, et se marchent dessus.
if (!(await presence.claim())) {
  console.error("worker: un autre worker tient le bail, arrêt");
  process.exit(1);
}

let isRunning = true;
const stop = (): void => {
  isRunning = false;
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

// En mode `off` : le worker garde son bail et son battement, mais n'écoute ni ne sauvegarde rien.
const subscriber = new Redis(config.redisUrl);
const historySubscriber = new Redis(config.redisUrl);
const log = (message: string, error?: unknown): void => console.error(`worker: ${message}`, error ?? "");
const historyPlan = createHistoryPlan();
// Écart §7.2 (JOURNAL 2026-10-08) : un canvas que Redis a perdu revient de sa sauvegarde, un pipeline Redis toutes les 5 s.
const recovery =
  config.scope === null
    ? null
    : createRecoveryCycle({
        target: createRecoveryTarget(redis),
        store: createRecoveryStore(config.convexUrl, config.convexServiceKey, config.scope),
        decode: decodeSnapshot,
        getCursor: historyPlan.getCursor,
        now: Date.now,
        log,
      });
// Écart §7.3 (JOURNAL 2026-10-08) : la pyramide des sauvegardes (heure, jour, semaine), lue une fois dans Convex puis tenue en mémoire.
const retention =
  config.scope === null
    ? null
    : createRetentionCycle({
        store: createRetentionStore(config.convexUrl, config.convexServiceKey, config.scope),
        decode: decodeSnapshot,
        encodeImage,
        now: Date.now,
        log,
      });
const cycle =
  config.scope === null
    ? null
    : createSnapshotCycle({
        source: createSnapshotSource(redis, subscriber),
        store: createSnapshotStore(config.convexUrl, config.convexServiceKey, config.scope),
        plan: createSnapshotPlan(),
        encode: encodeSnapshot,
        now: Date.now,
        log,
        onSaved: (canvasId) => recovery?.noteSaved(canvasId),
        onStored: (stored) => retention?.noteStored(stored),
      });
// Écart §7.2 (JOURNAL 2026-10-08) : l'historique des poses, lu dans le flux depuis le curseur de Convex.
const history =
  config.scope === null
    ? null
    : createHistoryCycle({
        source: createHistorySource(redis, historySubscriber),
        store: createHistoryStore(config.convexUrl, config.convexServiceKey, config.scope),
        plan: historyPlan,
        encode: encodeChunk,
        now: Date.now,
        log,
      });
// Écart §8.1 (JOURNAL 2026-10-08) : l'historique fin tient dans son budget (700 Mo en prod, 50 Mo ailleurs), le plus ancien d'abord.
const budget =
  config.scope === null
    ? null
    : createBudgetCycle({
        store: createBudgetStore(config.convexUrl, config.convexServiceKey, config.scope),
        budgetBytes: historyBudgetBytes(config.scope),
        now: Date.now,
        log,
      });
const delayWrites = createSnapshotDelayWrites(redis);
console.log(`worker: scope ${config.scope ?? "off"}`);

const unwatch = await cycle?.start();
const unwatchHistory = await history?.start();
await budget?.start();
await retention?.start();
let lastKeepAt = 0;
let lastSweepAt = 0;
let lastDelayAt = 0;
while (isRunning) {
  const nowMs = Date.now();
  if (nowMs - lastKeepAt >= KEEP_MS) {
    if (!(await presence.keep(nowMs))) {
      console.error("worker: bail perdu, arrêt");
      process.exit(1);
    }
    lastKeepAt = nowMs;
  }
  if (cycle && nowMs - lastSweepAt >= SWEEP_MS) {
    const canvases = await cycle.sweep().catch((error: unknown) => log("balayage échoué", error));
    if (canvases)
      await history
        ?.sweep(canvases.keys())
        .catch((error: unknown) => log("balayage de l'historique échoué", error));
    lastSweepAt = nowMs;
  }
  if (cycle && nowMs - lastDelayAt >= DELAY_REPORT_MS) {
    await delayWrites
      .storeSnapshotDelay({ at: nowMs, delayMs: cycle.getDelayMs() })
      .catch((error: unknown) => log("retard de la sauvegarde non déposé", error));
    lastDelayAt = nowMs;
  }
  await recovery?.tick();
  await cycle?.tick();
  await history?.tick();
  await retention?.tick();
  await budget?.tick();
  await delay(TICK_MS);
}

await unwatch?.();
await unwatchHistory?.();
await presence.leave();
subscriber.disconnect();
historySubscriber.disconnect();
await redis.quit();
