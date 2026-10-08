// Le sous-ensemble du §11.5 que le worker lit.

import { parseEnv } from "@liveplace/shared";
import { z } from "zod";

// Écart §11.5 (JOURNAL 2026-10-06) : aucun défaut. `off`, écrit exprès, est le seul moyen de ne rien sauvegarder.
const WorkerEnvSchema = z.object({
  REDIS_URL: z.string().min(1),
  CONVEX_URL: z.url(),
  CONVEX_SERVICE_KEY: z.string().min(1),
  DURABLE_SCOPE: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
});

export type WorkerConfig = {
  redisUrl: string;
  convexUrl: string;
  convexServiceKey: string;
  scope: string | null; // `null` : `off`, le worker ne sauvegarde rien
};

export function parseWorkerConfig(env: unknown): WorkerConfig {
  const parsed = parseEnv(WorkerEnvSchema, env);
  return {
    redisUrl: parsed.REDIS_URL,
    convexUrl: parsed.CONVEX_URL,
    convexServiceKey: parsed.CONVEX_SERVICE_KEY,
    scope: parsed.DURABLE_SCOPE === "off" ? null : parsed.DURABLE_SCOPE,
  };
}
