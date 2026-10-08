// Le cycle du worker (Écart §7.2, JOURNAL 2026-10-06) : écouter Redis, balayer, sauvegarder ce que le plan dit dû.

import type { SnapshotSource, SnapshotStore, Unsubscribe } from "@liveplace/domain/ports";
import type { CanvasSnapshot } from "@liveplace/domain/snapshot";
import type { SnapshotPlan } from "./snapshot-plan";

const TICK_BUDGET_MS = 10_000; // un tour rend la main avant la fin du bail (30 s), même avec des centaines de canvas dus

export type SnapshotCycleDeps = {
  source: SnapshotSource;
  store: SnapshotStore;
  plan: SnapshotPlan;
  encode(snapshot: CanvasSnapshot): Promise<Uint8Array>;
  now(): number;
  log(message: string, error?: unknown): void;
  onSaved?(canvasId: string): void; // Convex garde une sauvegarde de ce canvas : la récupération le sait (JOURNAL 2026-10-08)
  // Une sauvegarde de travail vient d'être rangée (pas refusée) : la rétention la compte parmi les deux dernières.
  onStored?(stored: { canvasId: string; version: number; takenAt: number }): void;
};

export function createSnapshotCycle({
  source,
  store,
  plan,
  encode,
  now,
  log,
  onSaved,
  onStored,
}: SnapshotCycleDeps) {
  let canvases = new Map<string, string[]>(); // le dernier balayage : chaque canvas et ses joueurs

  const saveCanvas = async (canvasId: string): Promise<void> => {
    const startedAt = now();
    try {
      const players = canvases.get(canvasId) ?? (await source.listPlayers(canvasId)); // absent du balayage : un canvas neuf
      canvases.set(canvasId, players);
      const snapshot = await source.getCanvasSnapshot(canvasId, players, startedAt);
      // Ni prêt, ni pose, ni modération : rien à ranger, le canvas attend sa prochaine activité.
      if (!snapshot) return plan.noteSaved(canvasId, 0, startedAt, now());
      const { version, takenAt } = snapshot;
      const bytes = await encode(snapshot);
      const answer = await store.storeSnapshot({
        canvasId,
        tier: "working",
        version,
        takenAt,
        schemaVersion: snapshot.schemaVersion,
        bytes,
      });
      if (answer === "refused")
        log(`snapshot ${canvasId} refusé : Convex garde une version plus avancée que Redis (${version})`);
      else onStored?.({ canvasId, version, takenAt });
      plan.noteSaved(canvasId, version, startedAt, now());
      onSaved?.(canvasId);
    } catch (error) {
      log(`snapshot ${canvasId} échoué`, error);
      plan.noteFailed(canvasId, now());
    }
  };

  // Archiver crée le canvas neuf sans rien publier sur lui : le worker sauvegarde aussi le successeur de l'archivé.
  const followSuccessor = async (canvasId: string): Promise<void> => {
    const successorId = await source.getSuccessorId(canvasId);
    if (successorId !== null) plan.noteActivity(successorId, false, now());
  };

  return {
    // Ce que Convex garde déjà, puis le canal `live` : le worker voit passer tous les canvas.
    async start(): Promise<Unsubscribe> {
      const latest = await store.listLatestSnapshots("working");
      plan.seed(latest);
      for (const { canvasId } of latest) onSaved?.(canvasId);
      return source.watch(({ canvasId, isPlacement, status }) => {
        // Supprimé : ses sauvegardes partent de Convex, aucune ne doit les suivre (JOURNAL 2026-10-08).
        if (status === "discarded") return plan.drop(canvasId);
        plan.noteActivity(canvasId, isPlacement, now());
        if (status === "archived")
          followSuccessor(canvasId).catch((error: unknown) => log("successeur non suivi", error));
      });
    },

    // Le rattrapage : chaque canvas de Redis, puis sa version, pour ce que le worker a manqué. Il rend les canvas vus.
    async sweep(): Promise<ReadonlyMap<string, string[]>> {
      canvases = await source.listCanvases();
      for (const canvasId of canvases.keys()) {
        const version = await source.getVersion(canvasId);
        if (version !== null) plan.noteVersion(canvasId, version, now());
      }
      return canvases;
    },

    // Le retard de la Sauvegarde (Écart §8.1, JOURNAL 2026-10-08) : l'âge de la plus ancienne modification pas encore
    // sauvegardée, 0 quand tout l'est.
    getDelayMs(): number {
      const oldest = plan.getOldestUnsavedAt();
      return oldest === null ? 0 : Math.max(0, now() - oldest);
    },

    // Un canvas à la fois : une lecture complète pèse sur Redis, et deux en parallèle ne vont pas plus vite.
    async tick(): Promise<void> {
      const startedAt = now();
      for (const canvasId of plan.listDue(startedAt)) {
        if (now() - startedAt >= TICK_BUDGET_MS) return; // le reste est toujours dû au tour suivant
        await saveCanvas(canvasId);
      }
    },
  };
}
