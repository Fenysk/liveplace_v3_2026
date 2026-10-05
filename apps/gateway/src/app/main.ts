// Le câblage du gateway : config, Redis, usecases, serveur (§3.3).

import { createCanvasCore, createTwitchCommandQueue } from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createSessionVerifier } from "../infra/session";
import { startGatewayServer } from "../infra/ws-server";
import { createBroadcast } from "../usecase/broadcast";
import { createConnection } from "../usecase/connection";
import { consumeTwitchCommands } from "../usecase/twitch-commands";
import { parseGatewayConfig } from "./config";

const CLOSE_RESTART = 1012; // §6.3 : les pages se reconnectent, un redéploiement coûte une seconde de blanc
const SHUTDOWN_GRACE_MS = 2000; // une socket qui ne répond plus à la fermeture ne retient pas l'arrêt

// Fail-closed : sans une variable obligatoire, le process s'arrête ici en la nommant (§11.5).
const config = parseGatewayConfig(process.env);

const redis = new Redis(config.redisUrl);
// En mode abonné, Redis n'accepte plus les autres commandes : il faut sa propre connexion (§6.3).
const liveSubscriber = new Redis(config.redisUrl);
const core = createCanvasCore(redis, liveSubscriber);
const broadcast = createBroadcast(core);

setInterval(broadcast.tick, Math.round(1000 / config.broadcastHz));

// §2 : les actions venues de Twitch, sur une connexion à elles, car la lecture attend.
let isRunning = true;
consumeTwitchCommands(
  { core, now: Date.now },
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
  verifier: createSessionVerifier(config.sessionSecret),
  openConnection: (socket, session) => createConnection({ core, broadcast, now: Date.now }, socket, session),
});

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
