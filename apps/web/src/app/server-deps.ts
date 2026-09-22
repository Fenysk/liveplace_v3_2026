// Les dépendances du serveur du web, construites une fois (§3.3). Jamais importé par le navigateur : voir `start.ts`.

import { randomUUID } from "node:crypto";
import { createDurableStore } from "@liveplace/durable";
import { createSignInWrites } from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createSessionSigner } from "../infra/session";
import { createTwitchAuth } from "../infra/twitch";
import { parseWebConfig } from "./config";

const buildServerDeps = () => {
  // Fail-closed (§11.5) : une variable manquante lève ici, en la nommant.
  const config = parseWebConfig(process.env);
  return {
    twitch: createTwitchAuth({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      redirectUri: `${config.publicUrl}/auth/twitch/callback`,
    }),
    durable: createDurableStore(config.convexUrl, config.convexServiceKey),
    redis: createSignInWrites(new Redis(config.redisUrl)),
    signer: createSessionSigner(config.sessionSecret),
    randomCanvasId: randomUUID,
    // Derrière Traefik, la requête arrive en http : c'est l'URL publique qui dit si le site est en https.
    isSecure: config.publicUrl.startsWith("https://"),
  };
};

export type ServerDeps = ReturnType<typeof buildServerDeps>;

let serverDeps: ServerDeps | undefined;

export function getServerDeps(): ServerDeps {
  serverDeps ??= buildServerDeps();
  return serverDeps;
}
