// La pyramide des sauvegardes (Écart §7.3, JOURNAL 2026-10-08) : le worker tient en mémoire les lignes de chaque palier, lues
// une fois à son démarrage, et applique le plan de `planRetention` à chaque passe. Une passe rejouée ne fait rien de plus :
// le worker peut s'arrêter au milieu et reprendre.

import type { RetentionStore } from "@liveplace/domain/ports";
import { planRetention, type RetentionAction, type TierRow, WORKING_KEPT } from "@liveplace/domain/retention";
import {
  type CanvasSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotImage,
  toSnapshotImage,
} from "@liveplace/domain/snapshot";
import type { Result } from "@liveplace/shared";

const PASS_MS = 60_000; // une passe par minute : l'heure, le jour et la semaine ne se ferment qu'à la minute près
const TICK_BUDGET_MS = 5_000; // un tour rend la main au bail et aux autres cycles, le reste de la passe suit au tour d'après
const RETRY_MS = 5 * 60_000; // un canvas dont un fichier ne se lit pas ou ne s'envoie pas attend, sans retenir les autres
const CANVASES_PER_PAGE = 50; // le démarrage lit les paliers par lots : une requête Convex ne lit pas tout d'un coup

export type RetentionCycleDeps = {
  store: RetentionStore;
  decode(bytes: Uint8Array): Promise<Result<CanvasSnapshot, string>>;
  encodeImage(image: SnapshotImage): Promise<Uint8Array>;
  now(): number;
  log(message: string, error?: unknown): void;
};

type StoredSnapshot = { canvasId: string; version: number; takenAt: number };

const isSameRow = (first: TierRow, second: TierRow): boolean =>
  first.tier === second.tier && first.takenAt === second.takenAt;

export function createRetentionCycle({ store, decode, encodeImage, now, log }: RetentionCycleDeps) {
  const canvases = new Map<string, TierRow[]>();
  const retryAt = new Map<string, number>();
  let queue: string[] = []; // la passe en cours : les canvas qui restent à voir
  let nextPassAt = 0;

  const rowsOf = (canvasId: string): TierRow[] => {
    const known = canvases.get(canvasId);
    if (known) return known;
    const created: TierRow[] = [];
    canvases.set(canvasId, created);
    return created;
  };

  const forget = (canvasId: string, row: TierRow): void => {
    canvases.set(
      canvasId,
      rowsOf(canvasId).filter((known) => !isSameRow(known, row)),
    );
  };

  const add = (canvasId: string, row: TierRow): void => {
    forget(canvasId, row);
    rowsOf(canvasId).push(row);
  };

  // Le dessin d'une sauvegarde complète, sans ses auteurs : lu, décodé, recompressé. `null` : la ligne n'existe plus.
  const getImage = async (canvasId: string, row: TierRow): Promise<Uint8Array | "stateOnly" | null> => {
    const file = await store.getFile(canvasId, row);
    if (!file) return null;
    if (file.isStateOnly) return "stateOnly";
    const decoded = await decode(file.bytes);
    if (!decoded.ok)
      throw new Error(`sauvegarde du ${new Date(row.takenAt).toISOString()} illisible (${decoded.error})`);
    return encodeImage(toSnapshotImage(decoded.value));
  };

  // Une ligne qui ne garde que le dessin, tirée d'une source complète : un fichier neuf. Les autres partagent le fichier.
  const promote = async (canvasId: string, action: Extract<RetentionAction, { kind: "promote" }>) => {
    const { from, to } = action;
    const image = action.isStateOnly && !from.isStateOnly ? await getImage(canvasId, from) : "stateOnly";
    if (image === null) return forget(canvasId, from);
    if (image === "stateOnly") {
      const answer = await store.promote(canvasId, from, to);
      if (answer === "missing") return forget(canvasId, from);
      return add(canvasId, { ...from, tier: to });
    }
    await store.storeStateOnly({
      canvasId,
      tier: to,
      version: from.version,
      takenAt: from.takenAt,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      bytes: image,
    });
    add(canvasId, { tier: to, version: from.version, takenAt: from.takenAt, isStateOnly: true });
  };

  const degrade = async (canvasId: string, row: TierRow) => {
    const image = await getImage(canvasId, row);
    if (image === null) return forget(canvasId, row);
    if (image !== "stateOnly" && (await store.degrade(canvasId, row, image)) === "missing")
      return forget(canvasId, row);
    add(canvasId, { ...row, isStateOnly: true });
  };

  const apply = async (canvasId: string, action: RetentionAction): Promise<void> => {
    if (action.kind === "promote") return promote(canvasId, action);
    if (action.kind === "degrade") return degrade(canvasId, action.row);
    await store.discard(canvasId, action.row);
    forget(canvasId, action.row);
  };

  // Un canvas : son plan, action après action. Une action qui échoue arrête le canvas, qui attend avant d'être revu.
  const settle = async (canvasId: string): Promise<void> => {
    if ((retryAt.get(canvasId) ?? 0) > now()) return;
    try {
      for (const action of planRetention(rowsOf(canvasId), now())) await apply(canvasId, action);
    } catch (error) {
      log(`rétention de ${canvasId} échouée`, error);
      retryAt.set(canvasId, now() + RETRY_MS);
    }
  };

  return {
    // Les paliers que Convex garde déjà, canvas par canvas : le worker les tient ensuite en mémoire.
    async start(): Promise<void> {
      for (let after = ""; ; ) {
        const page = await store.listTiers(after, CANVASES_PER_PAGE);
        for (const { canvasId, rows } of page.canvases) canvases.set(canvasId, [...rows]);
        if (page.next === null) return;
        after = page.next;
      }
    },

    // Une sauvegarde de travail vient d'être rangée : Convex ne garde que les deux dernières, la mémoire fait de même.
    noteStored({ canvasId, version, takenAt }: StoredSnapshot): void {
      add(canvasId, { tier: "working", version, takenAt, isStateOnly: false });
      const working = rowsOf(canvasId)
        .filter(({ tier }) => tier === "working")
        .sort((first, second) => second.takenAt - first.takenAt);
      for (const outdated of working.slice(WORKING_KEPT)) forget(canvasId, outdated);
    },

    // Une passe par minute sur tous les canvas, reprise au tour suivant si le budget du tour est épuisé.
    async tick(): Promise<void> {
      const startedAt = now();
      if (queue.length === 0 && startedAt >= nextPassAt) {
        queue = [...canvases.keys()];
        nextPassAt = startedAt + PASS_MS;
      }
      for (let canvasId = queue.shift(); canvasId !== undefined; canvasId = queue.shift()) {
        await settle(canvasId);
        if (now() - startedAt >= TICK_BUDGET_MS) return;
      }
    },
  };
}
