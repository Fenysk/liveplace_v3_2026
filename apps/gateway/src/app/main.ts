// Le câblage du gateway : config, Redis, usecases, serveur (§3.3).

import { createCanvasCore } from "@liveplace/redis-core";
import { Redis } from "ioredis";
import { createSessionVerifier } from "../infra/session";
import { startGatewayServer } from "../infra/ws-server";
import { createBroadcast } from "../usecase/broadcast";
import { createConnection } from "../usecase/connection";
import { parseGatewayConfig } from "./config";

const GATEWAY_PORT = 8080; // §11.1 : le port que vise Traefik

// Fail-closed : sans une variable obligatoire, le process s'arrête ici en la nommant (§11.5).
const config = parseGatewayConfig(process.env);

const redis = new Redis(config.redisUrl);
// En mode abonné, Redis n'accepte plus les autres commandes : il faut sa propre connexion (§6.3).
const liveSubscriber = new Redis(config.redisUrl);
const core = createCanvasCore(redis, liveSubscriber);
const broadcast = createBroadcast(core);

setInterval(broadcast.tick, Math.round(1000 / config.broadcastHz));

startGatewayServer({
  port: GATEWAY_PORT,
  verifier: createSessionVerifier(config.sessionSecret),
  openConnection: (socket, session) => createConnection({ core, broadcast, now: Date.now }, socket, session),
});
