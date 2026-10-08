// Remettre en place un canvas que Redis a perdu (Écart §7.2, JOURNAL 2026-10-08). Toutes les 5 s, un seul pipeline Redis nomme
// les canvas sauvegardés qui manquent ; Convex n'est lu que pour un canvas à remettre, jamais en boucle.

import type { RecoveryStore, RecoveryTarget } from "@liveplace/domain/ports";
import { type CanvasSnapshot, RECOVERY_VERSION_JUMP } from "@liveplace/domain/snapshot";
import type { Result } from "@liveplace/shared";

export const RECOVERY_CHECK_MS = 5_000; // la fenêtre où une page dirait « introuvable » ne dépasse pas cet intervalle
export const RECOVERY_RETRY_MS = 30_000; // un canvas qui n'a pas pu revenir : Convex a coupé, ou aucune sauvegarde lisible

export type RecoveryCycleDeps = {
  target: RecoveryTarget;
  store: RecoveryStore;
  decode(bytes: Uint8Array): Promise<Result<CanvasSnapshot, string>>;
  getCursor(canvasId: string): number; // le curseur de l'historique, en mémoire
  now(): number;
  log(message: string, error?: unknown): void;
};

// Chaque personne que le canvas nomme, une fois : de quoi redonner à Redis son miroir `user:<id>`.
const userIdsOf = (snapshot: CanvasSnapshot): string[] => [
  ...new Set([
    ...snapshot.authors,
    ...Object.keys(snapshot.progress),
    ...snapshot.bans,
    ...snapshot.mods,
    ...Object.keys(snapshot.scoreboard ?? {}),
    ...Object.keys(snapshot.scoreboardBanned ?? {}),
    ...Object.values(snapshot.reports).flat(),
  ]),
];

export function createRecoveryCycle({ target, store, decode, getCursor, now, log }: RecoveryCycleDeps) {
  const saved = new Set<string>(); // les canvas dont Convex garde une sauvegarde : ce que le worker sait, sans le redemander
  const retryAt = new Map<string, number>();
  let checkedAt = 0;

  // La dernière sauvegarde lisible : la précédente si elle ne l'est pas, rien si aucune.
  const getReadable = async (canvasId: string): Promise<CanvasSnapshot | null> => {
    for (const recent of await store.listRecentSnapshots(canvasId)) {
      const decoded = await decode(await recent.getBytes());
      if (decoded.ok) return decoded.value;
      log(`sauvegarde ${canvasId} de la version ${recent.version} illisible (${decoded.error})`);
    }
    return null;
  };

  const recover = async (canvasId: string): Promise<void> => {
    try {
      if ((await target.beginRestore(canvasId)) === "already_live") return;
      if (!(await store.hasCanvas(canvasId))) {
        saved.delete(canvasId);
        await target.cancelRestore(canvasId);
        return log(`canvas ${canvasId} supprimé de Convex : il n'est pas remis en place`);
      }
      const snapshot = await getReadable(canvasId);
      if (!snapshot) {
        retryAt.set(canvasId, now() + RECOVERY_RETRY_MS);
        return log(`canvas ${canvasId} bloqué en récupération : aucune sauvegarde lisible`);
      }
      const users = await store.listUsers(userIdsOf(snapshot));
      const version = Math.max(snapshot.version, getCursor(canvasId)) + RECOVERY_VERSION_JUMP;
      const answer = await target.restore(canvasId, { snapshot, users, version, at: now() });
      retryAt.delete(canvasId);
      log(`canvas ${canvasId} remis en place à la version ${version} (${answer})`);
    } catch (error) {
      retryAt.set(canvasId, now() + RECOVERY_RETRY_MS);
      log(`canvas ${canvasId} non remis en place, réessai dans 30 s`, error);
    }
  };

  return {
    // Une sauvegarde que Convex garde (la liste du démarrage, puis chaque snapshot rangé) : le canvas, s'il se perd, reviendra.
    noteSaved(canvasId: string): void {
      saved.add(canvasId);
    },

    async tick(): Promise<void> {
      const nowMs = now();
      if (nowMs - checkedAt < RECOVERY_CHECK_MS) return;
      checkedAt = nowMs;
      const waiting = [...saved].filter((canvasId) => nowMs >= (retryAt.get(canvasId) ?? 0));
      if (waiting.length === 0) return;
      const lost = await target.listLostCanvases(waiting).catch((error: unknown) => {
        log("canvas perdus non cherchés", error);
        return [];
      });
      for (const canvasId of lost) await recover(canvasId);
    },
  };
}
