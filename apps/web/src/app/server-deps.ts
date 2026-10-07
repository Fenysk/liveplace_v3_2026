// Les dépendances du serveur du web, construites une fois (§3.3). Jamais importé par le navigateur : voir `start.ts`.

import { randomBytes, randomUUID } from "node:crypto";
import { generateLinkCode } from "@liveplace/domain";
import { createDurableStore } from "@liveplace/durable";
import {
  createAccountList,
  createArchiveWrites,
  createCapacityWrites,
  createSignInWrites,
  createTwitchLiveStore,
  createTwitchWrites,
} from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createSessionSigner, createSessionVerifier } from "../infra/session";
import {
  createTwitchAuth,
  createTwitchEventSub,
  createTwitchLiveSource,
  createTwitchWebhook,
} from "../infra/twitch";
import { createTwitchLiveTracker } from "../usecase/twitch-live";
import { parseWebConfig } from "./config";

const buildServerDeps = () => {
  // Fail-closed (§11.5) : une variable manquante lève ici, en la nommant.
  const config = parseWebConfig(process.env);
  const redis = new Redis(config.redisUrl);
  const twitchWrites = createTwitchWrites(redis); // JOURNAL 2026-09-27
  const eventSub = createTwitchEventSub({
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
    callbackUrl: `${config.publicUrl}/twitch/eventsub`,
    secret: config.twitchEventSubSecret,
    isBeta: config.betaLabel !== null,
  });
  return {
    twitch: createTwitchAuth({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      redirectUri: `${config.publicUrl}/auth/twitch/callback`,
    }),
    durable: createDurableStore(config.convexUrl, config.convexServiceKey),
    redis: createSignInWrites(redis),
    twitchWrites,
    archiveWrites: createArchiveWrites(redis), // Écart §10.3 (JOURNAL 2026-10-06) : archiver, rouvrir, supprimer
    capacityWrites: createCapacityWrites(redis), // Écart §2 et §9 (JOURNAL 2026-10-07) : l'occupation du web, l'usage de Convex
    webhook: createTwitchWebhook(config.twitchEventSubSecret),
    eventSub,
    accounts: createAccountList(redis), // Écart §4 (JOURNAL 2026-10-07) : les comptes que le démarrage suit tous
    // Écart §4 et §10.1 (JOURNAL 2026-10-07) : le live des comptes, par EventSub, avec helix/streams en filet
    tracker: createTwitchLiveTracker({
      source: createTwitchLiveSource({
        clientId: config.twitchClientId,
        clientSecret: config.twitchClientSecret,
      }),
      eventSub,
      store: createTwitchLiveStore(redis),
      commands: twitchWrites,
      now: Date.now,
    }),
    now: Date.now,
    signer: createSessionSigner(config.sessionSecret),
    verifier: createSessionVerifier(config.sessionSecret), // Écart §10.2 (JOURNAL 2026-10-06) : l'affichage de `/{login}`
    randomCanvasId: randomUUID,
    // Écart §10.3 (JOURNAL 2026-10-06) : le code d'une archive, tiré par le web, sans biais de modulo.
    randomLinkCode: () => generateLinkCode((size) => randomBytes(size)),
    publicUrl: config.publicUrl, // les en-têtes de sécurité en tirent HTTPS et l'hôte du WebSocket (JOURNAL 2026-09-29)
    // Derrière Traefik, la requête arrive en http : c'est l'URL publique qui dit si le site est en https.
    isSecure: config.publicUrl.startsWith("https://"),
    betaLabel: config.betaLabel, // Écart §11.1 (JOURNAL 2026-10-04) : le bandeau et le `noindex` d'une bêta
  };
};

export type ServerDeps = ReturnType<typeof buildServerDeps>;

let serverDeps: ServerDeps | undefined;

export function getServerDeps(): ServerDeps {
  serverDeps ??= buildServerDeps();
  return serverDeps;
}
