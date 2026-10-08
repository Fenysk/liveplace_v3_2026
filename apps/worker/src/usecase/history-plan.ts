// Quand archiver l'historique de chaque canvas (Écart §7.2, JOURNAL 2026-10-08). Pur : l'heure vient toujours de l'appelant.

export const HISTORY_INTERVAL_MS = 5 * 60_000; // le tour : tout ce qui n'est pas archivé part
export const HISTORY_PENDING_MAX = 5_000; // des entrées non archivées qui font partir un chunk sans attendre le tour, et sa taille
export const HISTORY_MIN_INTERVAL_MS = 5_000; // au plus un chunk par canvas toutes les cinq secondes, même avec un retard
export const HISTORY_RETRY_MS = 30_000;

type CanvasPlan = {
  cursor: number; // la dernière version rangée dans Convex, 0 : rien
  checkedVersion: number; // la dernière version lue sans y trouver d'entrée (une taille) : inutile de relire avant mieux
  knownVersion: number; // la plus haute vue, sur le canal ou au balayage
  floor: number; // le saut de version d'une récupération : des versions sans entrée, qui n'attendent pas (JOURNAL 2026-10-08)
  firstSeenAt: number;
  readAt: number; // le dernier chunk ou la dernière lecture vide, 0 : jamais
  retryAt: number;
};

export function createHistoryPlan() {
  const plans = new Map<string, CanvasPlan>();
  const dropped = new Set<string>(); // supprimés : plus rien ne les archive (JOURNAL 2026-10-08)

  const planOf = (canvasId: string, nowMs: number): CanvasPlan => {
    const known = plans.get(canvasId);
    if (known) return known;
    const created: CanvasPlan = {
      cursor: 0,
      checkedVersion: 0,
      knownVersion: 0,
      floor: 0,
      firstSeenAt: nowMs,
      readAt: 0,
      retryAt: 0,
    };
    plans.set(canvasId, created);
    return created;
  };

  const pendingOf = (plan: CanvasPlan): number =>
    plan.knownVersion - Math.max(plan.cursor, plan.checkedVersion, plan.floor);

  const isDue = (plan: CanvasPlan, nowMs: number): boolean => {
    const pending = pendingOf(plan);
    if (pending <= 0 || nowMs < plan.retryAt) return false;
    if (pending >= HISTORY_PENDING_MAX && nowMs - plan.readAt >= HISTORY_MIN_INTERVAL_MS) return true;
    return nowMs - Math.max(plan.readAt, plan.firstSeenAt) >= HISTORY_INTERVAL_MS;
  };

  return {
    // Ce que Convex garde déjà, au démarrage ou après un chevauchement : le curseur de chaque canvas.
    seed(cursors: readonly { canvasId: string; version: number }[], nowMs: number): void {
      for (const { canvasId, version } of cursors) {
        if (dropped.has(canvasId)) continue;
        const plan = planOf(canvasId, nowMs);
        plan.cursor = version;
        plan.checkedVersion = Math.min(plan.checkedVersion, version);
      }
    },

    noteVersion(canvasId: string, version: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId, nowMs);
      plan.knownVersion = Math.max(plan.knownVersion, version);
    },

    // Une récupération a sauté jusqu'à `version` : seules les entrées d'après comptent pour les 5 000.
    noteFloor(canvasId: string, version: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId, nowMs);
      plan.floor = Math.max(plan.floor, version);
    },

    getCursor(canvasId: string): number {
      return plans.get(canvasId)?.cursor ?? 0;
    },

    getKnownVersion(canvasId: string): number {
      return plans.get(canvasId)?.knownVersion ?? 0;
    },

    noteArchived(canvasId: string, toVersion: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId, nowMs);
      plan.cursor = toVersion;
      plan.readAt = nowMs;
      plan.retryAt = 0;
    },

    // Une lecture qui n'a rien trouvé jusqu'à `version` : le curseur ne bouge pas, le trou se dira au chunk suivant.
    noteChecked(canvasId: string, version: number, nowMs: number): void {
      if (dropped.has(canvasId)) return;
      const plan = planOf(canvasId, nowMs);
      plan.checkedVersion = Math.max(plan.checkedVersion, version);
      plan.readAt = nowMs;
    },

    noteFailed(canvasId: string, nowMs: number): void {
      if (!dropped.has(canvasId)) planOf(canvasId, nowMs).retryAt = nowMs + HISTORY_RETRY_MS;
    },

    drop(canvasId: string): void {
      plans.delete(canvasId);
      dropped.add(canvasId);
    },

    listDue(nowMs: number): string[] {
      return [...plans].filter(([, plan]) => isDue(plan, nowMs)).map(([canvasId]) => canvasId);
    },
  };
}

export type HistoryPlan = ReturnType<typeof createHistoryPlan>;
