// La sonde de santé du conteneur (§7.5) : le worker bat si son battement est dans Redis.

import { Redis } from "ioredis";
import { HEARTBEAT_KEY } from "../infra/presence";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) process.exit(1);

// Sans reconnexion : un Redis injoignable est un conteneur malade, pas une attente.
const redis = new Redis(redisUrl, { lazyConnect: true, retryStrategy: () => null, connectTimeout: 3_000 });
try {
  await redis.connect();
  process.exit((await redis.get(HEARTBEAT_KEY)) === null ? 1 : 0);
} catch {
  process.exit(1);
}
