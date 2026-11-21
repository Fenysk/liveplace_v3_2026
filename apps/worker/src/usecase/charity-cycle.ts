// CDC 2026 §8, Mode événement (JOURNAL 2026-11-20) : le lecteur des dons. Toutes les 20 s, chaque fresque dont l'événement est à lire
// est lue une fois : un don arrive donc en moins d'une minute, même si une lecture échoue (deux essais par passage). Un verrou par
// fresque garantit un seul lecteur par événement, quel que soit le nombre d'instances. Les lectures partent en tâche de fond :
// le tour du worker, qui tient le bail et la modération, ne les attend jamais.

import { CHARITY_READ_EVERY_MS } from "@liveplace/domain/charity-event";
import type { CharityDonationSource, CharityDonationStore, CharityRead } from "@liveplace/domain/ports";

const ATTEMPTS = 2; // deux essais par passage : une panne brève de l'API ne retarde pas un don d'un passage entier
const ATTEMPT_TIMEOUT_MS = 10_000; // au-delà, l'API est tenue pour muette
const RETRY_AFTER_MS = 5_000;
const LOCK_TTL_MS = ATTEMPTS * ATTEMPT_TIMEOUT_MS + RETRY_AFTER_MS + 10_000; // couvre les deux essais ; une panne du lecteur le libère seule
const LOG_EVERY_FAILURES = 15; // une panne qui dure se redit toutes les 5 min, pas à chaque passage

export type CharityCycleDeps = {
  store: CharityDonationStore;
  source: CharityDonationSource;
  holder: string; // qui prend le verrou : un identifiant propre à ce process
  now(): number;
  wait(ms: number): Promise<void>;
  log(message: string, error?: unknown): void;
};

export function createCharityCycle({ store, source, holder, now, wait, log }: CharityCycleDeps) {
  let nextAt = 0;
  const reading = new Map<string, Promise<void>>(); // les lectures en cours, par fresque : jamais deux à la fois
  const failures = new Map<string, number>(); // les passages d'affilée sans réponse, par fresque

  // Deux essais, le second après une courte pause. Rend les dons lus, ou jette l'erreur du dernier essai.
  const listWithRetry = async (read: CharityRead) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await source.listDonations(read.source, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS));
      } catch (error) {
        if (attempt >= ATTEMPTS) throw error;
        await wait(RETRY_AFTER_MS);
      }
    }
  };

  const noteFailure = (canvasId: string, error: unknown): void => {
    const count = (failures.get(canvasId) ?? 0) + 1;
    failures.set(canvasId, count);
    if (count % LOG_EVERY_FAILURES === 1)
      log(
        `dons de la fresque ${canvasId} illisibles (passage ${count} sans réponse), nouvel essai au prochain`,
        error,
      );
  };

  const noteSuccess = (canvasId: string): void => {
    if (failures.delete(canvasId)) log(`dons de la fresque ${canvasId} de nouveau lus`);
  };

  const pollOnce = async (read: CharityRead): Promise<void> => {
    if (!(await store.lockCharityRead(read.canvasId, holder, LOCK_TTL_MS))) return; // un autre lecteur tient cet événement
    try {
      const donations = await listWithRetry(read);
      await store.storeCharityDonations(read.canvasId, donations, now());
      noteSuccess(read.canvasId);
    } catch (error) {
      noteFailure(read.canvasId, error);
    } finally {
      await store.unlockCharityRead(read.canvasId, holder).catch(() => undefined); // à défaut, le verrou expire seul
    }
  };

  const start = (read: CharityRead): void => {
    const task = pollOnce(read)
      .catch((error: unknown) => log(`lecture des dons de ${read.canvasId} interrompue`, error))
      .finally(() => reading.delete(read.canvasId));
    reading.set(read.canvasId, task);
  };

  return {
    // Rend la main aussitôt : le passage ne fait que lister les fresques à lire et lancer leurs lectures.
    async tick(): Promise<void> {
      const startedAt = now();
      if (startedAt < nextAt) return;
      nextAt = startedAt + CHARITY_READ_EVERY_MS;
      try {
        for (const read of await store.listCharityReads(startedAt))
          if (!reading.has(read.canvasId)) start(read);
      } catch (error) {
        log("fresques à lire illisibles, nouvel essai au prochain passage", error);
      }
    },

    // Attend les lectures en cours : l'arrêt du worker, et les preuves.
    async settle(): Promise<void> {
      await Promise.all(reading.values());
    },
  };
}
