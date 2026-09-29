// Le sous-ensemble du §11.5 que le gateway lit.

import { parseEnv } from "@liveplace/shared";
import { z } from "zod";

const GatewayEnvSchema = z.object({
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32), // §10.2 : 32 octets minimum
  BROADCAST_HZ: z.coerce.number().int().positive().default(10), // D-13, JOURNAL 2026-09-15
  PUBLIC_URL: z.url(), // Écart §11.5 (JOURNAL 2026-09-29)
});

export type GatewayConfig = {
  redisUrl: string;
  sessionSecret: string;
  broadcastHz: number;
  publicOrigin: string; // la seule origine d'où une page ouvre le WebSocket (JOURNAL 2026-09-29)
};

export function parseGatewayConfig(env: unknown): GatewayConfig {
  const parsed = parseEnv(GatewayEnvSchema, env);
  return {
    redisUrl: parsed.REDIS_URL,
    sessionSecret: parsed.SESSION_SECRET,
    broadcastHz: parsed.BROADCAST_HZ,
    publicOrigin: new URL(parsed.PUBLIC_URL).origin,
  };
}
