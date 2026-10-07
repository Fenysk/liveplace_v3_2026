// Le sous-ensemble du §11.5 que le web lit.

import type { ConvexDeployment } from "@liveplace/domain/ports";
import { parseEnv } from "@liveplace/shared";
import { z } from "zod";

// Écart §2 et §9 (JOURNAL 2026-10-07) : un déploiement Convex dont le web lit l'usage, nommé par le premier mot de son hôte.
// Jamais une URL qui n'est pas en https : la clé voyage dans un en-tête.
const toConvexDeployment = (url: string, key: string): ConvexDeployment | null => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" ? { name: hostname.split(".")[0] ?? hostname, url, key } : null;
  } catch {
    return null; // une URL illisible : la variable est refusée
  }
};

// Des paires « URL clé » séparées par des espaces. Une paire incomplète, une URL refusée ou un déploiement nommé deux fois
// donnent `null` : la variable est refusée sans que sa valeur, qui porte des clés, soit écrite.
function toConvexDeployments(raw: string): ConvexDeployment[] | null {
  const words = raw.split(/\s+/).filter((word) => word !== "");
  if (words.length % 2 !== 0) return null;
  const deployments: ConvexDeployment[] = [];
  for (let first = 0; first < words.length; first += 2) {
    const deployment = toConvexDeployment(words[first] ?? "", words[first + 1] ?? "");
    if (!deployment || deployments.some(({ name }) => name === deployment.name)) return null;
    deployments.push(deployment);
  }
  return deployments;
}

const WebEnvSchema = z.object({
  PUBLIC_URL: z.url(),
  SESSION_SECRET: z.string().min(32), // §10.2 : 32 octets minimum
  TWITCH_CLIENT_ID: z.string().min(1),
  TWITCH_CLIENT_SECRET: z.string().min(1),
  CONVEX_URL: z.url(),
  CONVEX_SERVICE_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TWITCH_EVENTSUB_SECRET: z.string().min(10).max(100), // JOURNAL 2026-09-27 : les bornes de Twitch
  BETA_LABEL: z.string().optional(), // Écart §11.1 (JOURNAL 2026-10-04) : vide en production, le compose la passe toujours
  // Écart §2 et §9 (JOURNAL 2026-10-07) : facultative ; sans elle, Convex est « non configuré ».
  CONVEX_USAGE_DEPLOYMENTS: z
    .string()
    .optional()
    .refine((raw) => raw === undefined || toConvexDeployments(raw) !== null, "paires URL clé en https"),
});

export type WebConfig = {
  publicUrl: string;
  sessionSecret: string;
  twitchClientId: string;
  twitchClientSecret: string;
  convexUrl: string;
  convexServiceKey: string;
  redisUrl: string;
  twitchEventSubSecret: string;
  betaLabel: string | null;
  convexUsageDeployments: ConvexDeployment[]; // aucun : Convex n'est pas configuré
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
    twitchEventSubSecret: parsed.TWITCH_EVENTSUB_SECRET,
    betaLabel: parsed.BETA_LABEL || null,
    convexUsageDeployments: toConvexDeployments(parsed.CONVEX_USAGE_DEPLOYMENTS ?? "") ?? [],
  };
}
