// Les dépendances du serveur du web, construites une fois (§3.3). Jamais importé par le navigateur : voir `start.ts`.

import { randomBytes, randomUUID } from "node:crypto";
import { generateLinkCode } from "@liveplace/domain";
import type { ChunkReader } from "@liveplace/domain/ports";
import {
  createChunkReader,
  createDonationStore,
  createDurableStore,
  createRecoveryStore,
} from "@liveplace/durable";
import {
  createAccountList,
  createAccountPurge,
  createArchiveWrites,
  createCapacityWrites,
  createDeletedAccounts,
  createHealthProbe,
  createRecoveryMarks,
  createSignInWrites,
  createTimelapseSource,
  createTwitchLiveStore,
  createTwitchWrites,
} from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createAvatarPhotos } from "../infra/avatar-photos";
import { createKofiWebhook } from "../infra/kofi";
import { createSessionSigner, createSessionVerifier } from "../infra/session";
import {
  createTwitchAuth,
  createTwitchEventSub,
  createTwitchLiveSource,
  createTwitchWebhook,
} from "../infra/twitch";
import { createBackgroundImages } from "../usecase/background-images";
import { createCanvasPreviews } from "../usecase/canvas-preview";
import { createHealthCheck } from "../usecase/check-health";
import {
  beginAccountDeletion,
  type DeleteAccountDeps,
  type DeleteAccountRequest,
  finishPendingDeletion,
} from "../usecase/delete-account";
import { createTwitchLiveTracker } from "../usecase/twitch-live";
import { parseWebConfig } from "./config";
import { createPreviewRenderer } from "./render-preview-png";

const toChunkReader = (config: ReturnType<typeof parseWebConfig>): ChunkReader =>
  config.durableScope === null
    ? {
        async *listChunks() {
          yield* [];
        },
      }
    : createChunkReader(config.convexUrl, config.convexServiceKey, config.durableScope);

const buildServerDeps = () => {
  // Fail-closed (§11.5) : une variable manquante lève ici, en la nommant.
  const config = parseWebConfig(process.env);
  const redis = new Redis(config.redisUrl);
  const twitchWrites = createTwitchWrites(redis, config.sessionSecret); // JOURNAL 2026-09-27
  const durable = createDurableStore(config.convexUrl, config.convexServiceKey);
  const archiveWrites = createArchiveWrites(redis); // §17.2 : archiver, rouvrir, supprimer
  const eventSub = createTwitchEventSub({
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
    callbackUrl: `${config.publicUrl}/twitch/eventsub`,
    secret: config.twitchEventSubSecret,
    isBeta: config.betaLabel !== null,
  });
  const accounts = createAccountList(redis, config.sessionSecret);
  const avatarPhotos = createAvatarPhotos({ fetchPhoto: fetch, now: Date.now });
  // §9.10 : l'image de la carte d'aperçu d'un lien, un rendu par canvas et par minute, avec la
  // photo Twitch du streamer que le serveur récupère lui-même
  const canvasPreviews = createCanvasPreviews({
    durable,
    redis: archiveWrites,
    render: createPreviewRenderer({ photos: avatarPhotos }),
    now: Date.now,
  });
  // §9.5 : l'image du fond d'une fresque, lue dans Convex une fois par login et par instant
  const backgroundImages = createBackgroundImages({ durable, now: Date.now });
  // CDC §8 : `deleteAccount` et sa reprise, avec ce que le web gardait en mémoire d'un streamer supprimé.
  const accountDeletion: DeleteAccountDeps = {
    durable,
    purge: createAccountPurge(redis, config.sessionSecret),
    eventSub,
    forgetOwner: ({ login, avatarUrl }) => {
      canvasPreviews.forget(login);
      backgroundImages.forget(login);
      avatarPhotos.forget(avatarUrl);
    },
    now: Date.now,
    randomRunId: randomUUID,
  };
  return {
    twitch: createTwitchAuth({
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      redirectUri: `${config.publicUrl}/auth/twitch/callback`,
    }),
    durable,
    redis: createSignInWrites(redis),
    // §7.4 : sans `DURABLE_SCOPE`, rien n'est demandé à Convex et aucune page n'est marquée.
    recovery:
      config.durableScope === null
        ? undefined
        : createRecoveryStore(config.convexUrl, config.convexServiceKey, config.durableScope),
    recoveryMarks: createRecoveryMarks(redis),
    // JOURNAL 2026-11-11 : le GIF timelapse du développeur lit Redis, puis les chunks de Convex de son scope (aucun sans `DURABLE_SCOPE`).
    timelapseSource: createTimelapseSource(redis),
    chunkReader: toChunkReader(config),
    twitchWrites,
    archiveWrites,
    canvasPreviews,
    backgroundImages,
    accountDeletion,
    // Une reconnexion termine d'abord l'effacement interrompu du même compte (CDC §8).
    finishPendingDeletion: (userId: string) => finishPendingDeletion(accountDeletion, userId),
    // Le bouton de Mon compte et l'accès retiré chez Twitch inscrivent l'effacement, puis la routine finit seule (CDC §8).
    beginDeletion: (request: DeleteAccountRequest) => beginAccountDeletion(accountDeletion, request),
    capacityWrites: createCapacityWrites(redis), // §16.3 : l'occupation du web, l'usage de Convex
    checkHealth: createHealthCheck(createHealthProbe(redis)), // JOURNAL 2026-11-03 : `GET /healthz`
    webhook: createTwitchWebhook(config.twitchEventSubSecret),
    // JOURNAL 2026-11-03 : un don Ko-fi arrive sur /kofi/webhook, vérifié par le jeton de Ko-fi.
    kofiWebhook: createKofiWebhook(config.kofiSecret),
    donations: createDonationStore(config.convexUrl, config.convexServiceKey),
    eventSub,
    accounts, // §10.4 : les comptes que le démarrage suit tous
    // §10.4 : le live des comptes, par EventSub, avec helix/streams en filet
    tracker: createTwitchLiveTracker({
      source: createTwitchLiveSource({
        clientId: config.twitchClientId,
        clientSecret: config.twitchClientSecret,
      }),
      eventSub,
      accounts,
      store: createTwitchLiveStore(redis, config.sessionSecret),
      now: Date.now,
    }),
    now: Date.now,
    signer: createSessionSigner(config.sessionSecret),
    // §10.2 : l'affichage de `/{login}`, qui refuse la session d'un compte supprimé (CDC §8)
    verifier: createSessionVerifier(config.sessionSecret, createDeletedAccounts(redis, config.sessionSecret)),
    randomCanvasId: randomUUID,
    // §17.2 : le code d'une archive, tiré par le web, sans biais de modulo.
    randomLinkCode: () => generateLinkCode((size) => randomBytes(size)),
    publicUrl: config.publicUrl, // les en-têtes de sécurité en tirent HTTPS et l'hôte du WebSocket (JOURNAL 2026-09-29)
    // Derrière Traefik, la requête arrive en http : c'est l'URL publique qui dit si le site est en https.
    isSecure: config.publicUrl.startsWith("https://"),
    betaLabel: config.betaLabel, // §11.1 : le bandeau et le `noindex` d'une bêta
  };
};

export type ServerDeps = ReturnType<typeof buildServerDeps>;

let serverDeps: ServerDeps | undefined;

export function getServerDeps(): ServerDeps {
  serverDeps ??= buildServerDeps();
  return serverDeps;
}
