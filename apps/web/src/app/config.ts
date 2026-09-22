// Le sous-ensemble du §11.5 que le web lit.

import { parseEnv } from "@liveplace/shared";
import { z } from "zod";

const WebEnvSchema = z.object({
  PUBLIC_URL: z.url(),
  SESSION_SECRET: z.string().min(32), // §10.2 : 32 octets minimum
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  CONVEX_URL: z.url(),
  CONVEX_SERVICE_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
});

export type WebConfig = {
  publicUrl: string;
  sessionSecret: string;
  twitchClientId: string;
  twitchClientSecret: string;
  convexUrl: string;
  convexServiceKey: string;
  redisUrl: string;
};

export function parseWebConfig(env: unknown): WebConfig {
  const parsed = parseEnv(WebEnvSchema, env);
  return {
    // Le redirect OAuth se construit dessus et doit correspondre octet pour octet à celui déclaré chez Twitch (§13).
    publicUrl: parsed.PUBLIC_URL.replace(/\/$/, ""),
    sessionSecret: parsed.SESSION_SECRET,
    twitchClientId: parsed.TWITCH_CLIENT_ID,
    twitchClientSecret: parsed.TWITCH_CLIENT_SECRET,
    convexUrl: parsed.CONVEX_URL,
    convexServiceKey: parsed.CONVEX_SERVICE_KEY,
    redisUrl: parsed.REDIS_URL,
  };
}
