// Plugin Nitro, exécuté une fois au démarrage : une variable manquante arrête le process en la nommant (§10.2).
// Sans lui, Nitro ne charge l'application qu'à la première requête, et chaque requête rendrait 500.
// §16.3 : il lance aussi les minuteries de la capacité, que le gateway lit dans Redis.

import { definePlugin } from "nitro";
import { createConvexUsageSource } from "../infra/convex-usage";
import { createEventLoopMeter } from "../infra/event-loop";
import { createCapacityReport } from "../usecase/capacity-report";
import { RESUME_PENDING_DELETIONS_MS, resumePendingDeletions } from "../usecase/delete-account";
import { trackKnownAccounts } from "../usecase/track-known-accounts";
import { parseWebConfig } from "./config";
import { getServerDeps } from "./server-deps";

const ACCESS_REVOKED_CHECK_MS = 6 * 3600 * 1000;

export default definePlugin(() => {
  const config = parseWebConfig(process.env);
  const report = createCapacityReport({
    writes: getServerDeps().capacityWrites,
    now: Date.now,
    getUtilizationPercent: createEventLoopMeter(),
    sources: config.convexUsageDeployments.map((deployment) => createConvexUsageSource(deployment)),
    // `unref` : une minuterie ne retient jamais l'arrêt du process.
    repeat: (ms, run) => {
      setInterval(() => void run(), ms).unref();
    },
  });
  void report.start(); // ne rejette jamais : chaque minuterie journalise ses échecs
  // §10.4 : tous les comptes connus sont suivis, en arrière-plan, sans retarder le démarrage ; il ne rejette jamais.
  const { accounts, accountDeletion, eventSub, tracker } = getServerDeps();
  // CDC §8 : l'accès retiré dans Twitch efface le compte. Un abonnement de toute l'application, pris où les autres le sont (prod
  // seulement), au démarrage puis toutes les 6 h : Twitch coupe un abonnement dont les livraisons échouent trop.
  const subscribeToAccessRevoked = (): void => {
    eventSub
      .subscribeToAccessRevoked()
      .catch((error: unknown) => console.error("twitch : abonnement à l'accès retiré impossible", error));
  };
  subscribeToAccessRevoked();
  setInterval(subscribeToAccessRevoked, ACCESS_REVOKED_CHECK_MS).unref();
  // CDC §8 : tout effacement de compte resté en cours (un arrêt, une panne) finit seul : au démarrage, puis chaque minute.
  let isResuming = false;
  const resume = (): void => {
    if (isResuming) return;
    isResuming = true;
    void resumePendingDeletions(accountDeletion).finally(() => {
      isResuming = false;
    });
  };
  resume();
  setInterval(resume, RESUME_PENDING_DELETIONS_MS).unref();
  void trackKnownAccounts({
    accounts,
    tracker,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref()),
  });
});
