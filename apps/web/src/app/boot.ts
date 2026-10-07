// Plugin Nitro, exécuté une fois au démarrage : une variable manquante arrête le process en la nommant (§10.2).
// Sans lui, Nitro ne charge l'application qu'à la première requête, et chaque requête rendrait 500.
// Écart §2 et §9 (JOURNAL 2026-10-07) : il lance aussi les minuteries de la capacité, que le gateway lit dans Redis.

import { definePlugin } from "nitro";
import { createConvexUsageSource } from "../infra/convex-usage";
import { createEventLoopMeter } from "../infra/event-loop";
import { createCapacityReport } from "../usecase/capacity-report";
import { parseWebConfig } from "./config";
import { getServerDeps } from "./server-deps";

export default definePlugin(() => {
  const config = parseWebConfig(process.env);
  const report = createCapacityReport({
    writes: getServerDeps().capacityWrites,
    now: Date.now,
    getUtilizationPercent: createEventLoopMeter(),
    sources: config.convexUsageDeployments.map((deployment) => createConvexUsageSource(deployment)),
    // `unref` : une minuterie ne retient jamais l'arrêt du process.
    repeat: (ms, run) => {
      setInterval(() => void run(), ms).unref();
    },
  });
  void report.start(); // ne rejette jamais : chaque minuterie journalise ses échecs
});
