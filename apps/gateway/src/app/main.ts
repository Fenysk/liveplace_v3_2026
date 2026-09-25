// Le câblage du gateway : config, Redis, usecases, serveur (§3.3).

import { createCanvasCore } from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createSessionVerifier } from "../infra/session";
import { startGatewayServer } from "../infra/ws-server";
import { createBroadcast } from "../usecase/broadcast";
import { createConnection } from "../usecase/connection";
import { parseGatewayConfig } from "./config";

const GATEWAY_PORT = 8080; // §11.1 : le port que vise Traefik
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

const server = startGatewayServer({
  port: GATEWAY_PORT,
  verifier: createSessionVerifier(config.sessionSecret),
  openConnection: (socket, session) => createConnection({ core, broadcast, now: Date.now }, socket, session),
});

const shutDown = (): void => {
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
