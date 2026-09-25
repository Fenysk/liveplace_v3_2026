// La reprise d'une connexion perdue (§4.5, JOURNAL 2026-09-25) : quand rouvrir, et quand la croire morte.

export const PING_INTERVAL_MS = 25_000; // §4.2 : le serveur répond `pong`
export const MISSED_PONGS_LIMIT = 2; // deux pings sans réponse : la connexion est morte, même si le navigateur l'ignore

const RECONNECT_DELAYS_MS = [1000, 2000, 5000] as const;
const RECONNECT_MAX_DELAY_MS = 10_000;
const RECONNECT_JITTER_MS = 1000;

// Espacée, jamais en rafale, et un peu de hasard : après un redéploiement, les pages ne reviennent pas toutes ensemble.
export function reconnectDelayMs(attempt: number, random: () => number): number {
  const delay = RECONNECT_DELAYS_MS[attempt] ?? RECONNECT_MAX_DELAY_MS;
  return delay + Math.floor(random() * RECONNECT_JITTER_MS);
}
