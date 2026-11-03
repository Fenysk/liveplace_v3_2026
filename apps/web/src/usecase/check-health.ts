// JOURNAL 2026-11-03 : ce que `GET /healthz` répond à un service de surveillance. Le web répond, donc il vit ; reste à savoir si Redis,
// le gateway et le worker répondent aussi. La réponse nomme les parties en échec et rien d'autre : ni message d'erreur, ni hôte.

import type { HealthProbe } from "@liveplace/domain/ports";

export const HEALTH_PART_TIMEOUT_MS = 2000; // le robot attend 5 s la réponse entière : les sondes partent ensemble

export type HealthPart = keyof HealthProbe;

export type HealthAnswer = { status: 200 } | { status: 503; failed: HealthPart[] };

const PARTS: readonly HealthPart[] = ["redis", "gateway", "worker"];

// ioredis garde en file les commandes d'une connexion coupée : seule la minuterie peut dire qu'une partie ne répond pas. Un rejet vaut un échec.
const isUp = (ask: () => Promise<boolean>, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const settle = (isAlive: boolean): void => {
      clearTimeout(timer);
      resolve(isAlive);
    };
    Promise.resolve()
      .then(ask)
      .then(settle, () => settle(false));
  });

export function createHealthCheck(
  probe: HealthProbe,
  timeoutMs: number = HEALTH_PART_TIMEOUT_MS,
): () => Promise<HealthAnswer> {
  let running: Promise<HealthAnswer> | undefined;

  const run = async (): Promise<HealthAnswer> => {
    const states = await Promise.all(
      PARTS.map(async (part) => ({ part, isAlive: await isUp(() => probe[part](), timeoutMs) })),
    );
    const failed = states.filter(({ isAlive }) => !isAlive).map(({ part }) => part);
    return failed.length === 0 ? { status: 200 } : { status: 503, failed };
  };

  // Une adresse publique, sans authentification : pendant qu'une vérification tourne, les autres requêtes en partagent le résultat.
  return () => {
    running ??= run().finally(() => {
      running = undefined;
    });
    return running;
  };
}
