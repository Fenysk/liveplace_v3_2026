// CDC §8, Supprimer son compte : la session d'un compte supprimé (JOURNAL 2026-11-01). Le jeton est un JWT de 30 jours
// sans état : il se vérifie sans réseau et ne peut pas être révoqué. Ce que Redis garde à la place, c'est une empreinte
// HMAC de l'identifiant Twitch (jamais l'identifiant) avec l'instant de la suppression, pour la durée d'un jeton.

import { createHmac } from "node:crypto";
import type { DeletedAccountListener, DeletedAccounts, Unsubscribe } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { DELETED_ACCOUNTS_CHANNEL, deletedAccountKey, PENDING_DELETIONS_KEY, userKey } from "./keys";

// Le libellé sépare cette empreinte de toute autre dérivée du même secret (la signature des sessions n'en est pas une).
const FINGERPRINT_LABEL = "liveplace:deleted-account:v1:";

// Le secret des sessions existe déjà dans le web et le gateway : aucune variable d'environnement de plus.
export const toDeletedAccountFingerprint = (secret: string, userId: string): string =>
  createHmac("sha256", secret).update(`${FINGERPRINT_LABEL}${userId}`).digest("hex");

export const toDeletedAccountKey = (secret: string, userId: string): string =>
  deletedAccountKey(toDeletedAccountFingerprint(secret, userId));

// Un compte supprimé, ou en cours de l'être (JOURNAL 2026-11-02) : son effacement est marqué, ou son empreinte est posée et
// son miroir `user:` n'est pas revenu. Un compte qui se reconnecte pose un miroir neuf : l'empreinte, gardée 31 jours, ne le
// condamne pas. À lire dans le même script que l'écriture qu'elle garde : entre la lecture et l'écriture, l'effacement passerait.
// Les clés qu'elle lit, dans l'ordre de ses arguments : `deletedAccountGuardKeys`.
export const IS_DELETED_ACCOUNT_LUA = `local function isDeletedAccount(userId, pendingKey, fingerprintKey, mirrorKey)
  if redis.call("HEXISTS", pendingKey, userId) == 1 then
    return true
  end
  return redis.call("EXISTS", fingerprintKey) == 1 and redis.call("EXISTS", mirrorKey) == 0
end`;

export const deletedAccountGuardKeys = (secret: string, userId: string): [string, string, string] => [
  PENDING_DELETIONS_KEY,
  toDeletedAccountKey(secret, userId),
  userKey(userId),
];

export function createDeletedAccounts(redis: Redis, secret: string): DeletedAccounts {
  return {
    // Un jeton émis avant la seconde de la suppression vaut un invité. Émis à cette seconde ou après, c'est celui d'une
    // reconnexion : un compte neuf, qui doit marcher (JOURNAL 2026-11-01).
    async isSessionRevoked(userId, issuedAt) {
      const deletedAt = await redis.get(toDeletedAccountKey(secret, userId));
      return deletedAt !== null && issuedAt < Math.floor(Number(deletedAt) / 1000);
    },
  };
}

// Sur la connexion abonnée du gateway, à part de celle des canvas : le canal n'a qu'un message, l'identifiant du compte.
export async function watchDeletedAccounts(
  subscriber: Redis,
  onDeleted: DeletedAccountListener,
): Promise<Unsubscribe> {
  const listener = (channel: string, userId: string): void => {
    if (channel === DELETED_ACCOUNTS_CHANNEL) onDeleted(userId);
  };
  subscriber.on("message", listener);
  await subscriber.subscribe(DELETED_ACCOUNTS_CHANNEL);
  return async () => {
    subscriber.off("message", listener);
    await subscriber.unsubscribe(DELETED_ACCOUNTS_CHANNEL);
  };
}
