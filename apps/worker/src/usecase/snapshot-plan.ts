// Quand sauvegarder chaque canvas (Écart §7.2, JOURNAL 2026-10-06). Pur : l'heure vient toujours de l'appelant.

export const URGENT_DEBOUNCE_MS = 500; // une modération attend une demi-seconde de calme : ses tranches s'enchaînent
export const URGENT_MAX_WAIT_MS = 3_000; // et jamais plus, même si les actions ne s'arrêtent pas
export const MIN_INTERVAL_MS = 5_000; // au plus un snapshot par canvas toutes les cinq secondes
export const PLACEMENT_INTERVAL_MS = 5 * 60_000; // la promesse : cinq minutes de poses au plus perdues
export const REFRESH_INTERVAL_MS = 24 * 3_600_000; // un réglage ne change pas la version : un tour par jour le rattrape
export const RETRY_MS = 30_000;

type CanvasPlan = {
  savedVersion: number | null; // `null` : aucune sauvegarde connue
  savedAt: number; // 0 : jamais
  retryAt: number;
  placementAt: number | null; // la dernière pose, ou version, pas encore sauvegardée
  urgentFirstAt: number | null; // la première action pressée pas encore sauvegardée
  urgentLastAt: number | null;
  unsavedSince: number | null; // la plus ancienne modification pas encore sauvegardée : le retard de la Sauvegarde (JOURNAL 2026-10-08)
};

type SavedCanvas = { canvasId: string; version: number; takenAt: number };

export function createSnapshotPlan() {
  const plans = new Map<string, CanvasPlan>();
  const dropped = new Set<string>(); // supprimés (JOURNAL 2026-10-08) : plus rien ne les planifie

  const planOf = (canvasId: string): CanvasPlan => {
    const known = plans.get(canvasId);
    if (known) return known;
    const created: CanvasPlan = {
      savedVersion: null,
      savedAt: 0,
      retryAt: 0,
      placementAt: null,
      urgentFirstAt: null,
      urgentLastAt: null,
      unsavedSince: null,
    };
    plans.set(canvasId, created);
    return created;
  };

  const isDue = (plan: CanvasPlan, nowMs: number): boolean => {
    if (nowMs < plan.retryAt) return false;
    if (plan.urgentFirstAt !== null && plan.urgentLastAt !== null) {
      const isCalm =
        nowMs - plan.urgentLastAt >= URGENT_DEBOUNCE_MS || nowMs - plan.urgentFirstAt >= URGENT_MAX_WAIT_MS;
      return isCalm && nowMs - plan.savedAt >= MIN_INTERVAL_MS;
    }
    if (plan.placementAt !== null) return nowMs - plan.savedAt >= PLACEMENT_INTERVAL_MS;
    return plan.savedVersion !== null && nowMs - plan.savedAt >= REFRESH_INTERVAL_MS;
  };

  return {
    // Ce que Convex garde déjà, au démarrage : la version et l'heure de la dernière sauvegarde de chaque canvas.
    seed(saved: readonly SavedCanvas[]): void {
      for (const { canvasId, version, takenAt } of saved) {
        const plan = planOf(canvasId);
        plan.savedVersion = version;
        plan.savedAt = takenAt;
      }
    },

    // Ce qui passe sur le canal `live` : une pose attend son tour, tout le reste est pressé.
    noteActivity(canvasId: string, isPlacement: boolean, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId);
      plan.unsavedSince ??= nowMs;
      if (isPlacement) {
        plan.placementAt = nowMs;
        return;
      }
      plan.urgentFirstAt ??= nowMs;
      plan.urgentLastAt = nowMs;
    },

    // Le balayage : un Redis en retard sur Convex ne se sauvegarde pas. Un canvas en version 0 est demandé une fois à la
    // source, qui garde ou non ce que la modération et la progression recopiées valent (JOURNAL 2026-10-08).
    noteVersion(canvasId: string, version: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId);
      if (plan.savedVersion !== null && version <= plan.savedVersion) return;
      plan.placementAt = nowMs;
      plan.unsavedSince ??= nowMs;
    },

    // `startedAt` : quand la lecture a commencé. Ce qui est arrivé après n'est pas dans le snapshot, et reste à faire.
    noteSaved(canvasId: string, version: number, startedAt: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId);
      plan.savedVersion = version;
      plan.savedAt = nowMs;
      plan.retryAt = 0;
      if (plan.urgentLastAt !== null && plan.urgentLastAt <= startedAt) {
        plan.urgentFirstAt = null;
        plan.urgentLastAt = null;
      }
      if (plan.placementAt !== null && plan.placementAt <= startedAt) plan.placementAt = null;
      // Ce qui reste est arrivé après le début de la lecture : le retard repart de là.
      plan.unsavedSince = plan.placementAt === null && plan.urgentLastAt === null ? null : startedAt;
    },

    // Le canvas est supprimé : ses sauvegardes partent de Convex, aucune nouvelle ne doit les suivre.
    drop(canvasId: string): void {
      plans.delete(canvasId);
      dropped.add(canvasId);
    },

    noteFailed(canvasId: string, nowMs: number): void {
      if (!dropped.has(canvasId)) planOf(canvasId).retryAt = nowMs + RETRY_MS;
    },

    // La plus ancienne modification pas encore sauvegardée, tous canvas confondus ; `null` : tout est sauvegardé.
    getOldestUnsavedAt(): number | null {
      const dates = [...plans.values()].flatMap(({ unsavedSince }) =>
        unsavedSince === null ? [] : [unsavedSince],
      );
      return dates.length === 0 ? null : Math.min(...dates);
    },

    listDue(nowMs: number): string[] {
      return [...plans].filter(([, plan]) => isDue(plan, nowMs)).map(([canvasId]) => canvasId);
    },
  };
}

export type SnapshotPlan = ReturnType<typeof createSnapshotPlan>;
