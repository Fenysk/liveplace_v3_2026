// Le câblage du gateway : config, Redis, usecases, serveur (§3.3).

import { CAPACITY_SAMPLE_MS } from "@liveplace/domain/capacity";
import {
  createActivityStore,
  createCanvasCore,
  createCapacityStore,
  createDeletedAccounts,
  createGatewayHeartbeat,
  createTwitchCommandQueue,
  revokeBannedModerators,
  watchDeletedAccounts,
} from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createHostProbe } from "../infra/host";
import { createSessionVerifier } from "../infra/session";
import { startGatewayServer } from "../infra/ws-server";
import { ACTIVITY_TICK_MS, createActivity } from "../usecase/activity";
import { createBroadcast, SCOREBOARD_WINDOW_MS } from "../usecase/broadcast";
import { CAPACITY_TICK_MS, createCapacity } from "../usecase/capacity";
import { createConnection } from "../usecase/connection";
import { createDelayTally } from "../usecase/delay-tally";
import { createOpenConnections } from "../usecase/open-connections";
import { consumeTwitchCommands } from "../usecase/twitch-commands";
import { parseGatewayConfig } from "./config";

const CLOSE_RESTART = 1012; // §6.3 : les pages se reconnectent, un redéploiement coûte une seconde de blanc
const SHUTDOWN_GRACE_MS = 2000; // une socket qui ne répond plus à la fermeture ne retient pas l'arrêt
const DRAWING_TICK_MS = 1000; // JOURNAL 2026-11-12 : la fermeture du dessin, à la seconde près après la fin du live + 10 min
const HEARTBEAT_MS = 10_000; // le battement expire en 30 s : deux battements manqués sont tolérés

// Fail-closed : sans une variable obligatoire, le process s'arrête ici en la nommant (§11.5).
const config = parseGatewayConfig(process.env);

const redis = new Redis(config.redisUrl);
// En mode abonné, Redis n'accepte plus les autres commandes : il faut sa propre connexion (§6.3).
const liveSubscriber = new Redis(config.redisUrl);
const core = createCanvasCore(redis, liveSubscriber);
// §5.4 : avant la première page, les modérateurs nommés ici que le bug avait laissés bannis perdent ce
// rôle. Un échec se journalise : les scripts tiennent déjà la règle, et le prochain démarrage recommence.
await revokeBannedModerators(redis).then(
  (revoked) => {
    if (revoked > 0) console.info(`gateway: ${revoked} rôle(s) de modérateur retiré(s) à des bannis`);
  },
  (error: unknown) => console.error("gateway: modérateurs bannis non retirés", error),
);
// §16.3 : le retard de diffusion, d'une pose reçue à l'envoi de sa frame, sans l'attente du tick.
const tickMs = Math.round(1000 / config.broadcastHz);
const delays = createDelayTally();
const broadcast = createBroadcast(core, { now: Date.now, record: delays.record, tickMs });

setInterval(broadcast.tick, tickMs);
// JOURNAL 2026-10-06 : le classement a sa propre cadence, plus lente.
setInterval(() => void broadcast.tickScoreboard(), SCOREBOARD_WINDOW_MS);
// JOURNAL 2026-11-12 : le dessin seulement pendant le live se ferme à l'échéance, sans événement.
setInterval(broadcast.tickDrawing, DRAWING_TICK_MS);

// §16.2 : la température d'avant le redémarrage, avant la première page.
const activity = createActivity({
  store: createActivityStore(redis),
  core,
  now: Date.now,
  isProduction: config.isProduction,
});
await activity.start();
setInterval(() => {
  activity
    .tick()
    .catch((error: unknown) => console.error("gateway: activité non écrite ou non envoyée", error));
}, ACTIVITY_TICK_MS);

// §16.3 : la capacité se mesure toutes les 10 s, et part toutes les 2 s à qui la regarde.
const capacity = createCapacity({
  store: createCapacityStore(redis),
  host: createHostProbe(),
  broadcast,
  delays,
  now: Date.now,
  isProduction: config.isProduction,
});
await capacity.start();
setInterval(() => {
  capacity.sample().catch((error: unknown) => console.error("gateway: capacité non mesurée", error));
}, CAPACITY_SAMPLE_MS);
setInterval(capacity.tick, CAPACITY_TICK_MS);

// CDC §8 : un compte supprimé voit fermer ses connexions et celles des pages de ses fresques, et le gateway l'oublie. Sur sa
// propre connexion abonnée : le canal n'a pas de rapport avec ceux des canvas.
const connections = createOpenConnections();
await watchDeletedAccounts(new Redis(config.redisUrl), (userId) => {
  connections.closeAccount(userId);
  activity.forgetOwner(userId);
});

// §2 : les actions venues de Twitch, sur une connexion à elles, car la lecture attend.
let isRunning = true;
consumeTwitchCommands(
  { core, broadcast, now: Date.now, wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
  createTwitchCommandQueue(new Redis(config.redisUrl)),
  () => isRunning,
).catch((error: unknown) => {
  // Redis injoignable : le conteneur redémarre (restart: unless-stopped), et reprend ce qu'il n'avait pas acquitté.
  console.error("gateway: file des actions Twitch arrêtée", error);
  process.exit(1);
});

const server = startGatewayServer({
  port: config.port,
  publicOrigin: config.publicOrigin,
  verifier: createSessionVerifier(config.sessionSecret, createDeletedAccounts(redis, config.sessionSecret)),
  openConnection: (socket, session, device) =>
    createConnection(
      { core, broadcast, activity, capacity, connections, now: Date.now },
      socket,
      session,
      device,
    ),
  onBytesSent: capacity.countBytes,
  onClosedBehind: capacity.countClosedConnection,
});

// JOURNAL 2026-11-03 : le battement que lit `/healthz` du web, une fois le serveur ouvert. Un gateway figé cesse de battre.
const heartbeat = createGatewayHeartbeat(redis);
const beat = (): void => {
  heartbeat.beat(Date.now()).catch((error: unknown) => console.error("gateway: battement non écrit", error));
};
beat();
setInterval(beat, HEARTBEAT_MS);

const shutDown = (): void => {
  isRunning = false;
  server.closeSockets(CLOSE_RESTART);
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error("gateway: arrêt incomplet", error);
      process.exit(1);
    },
  );
};
process.once("SIGTERM", shutDown);
process.once("SIGINT", shutDown);
