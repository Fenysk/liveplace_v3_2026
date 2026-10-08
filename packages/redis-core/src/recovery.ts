// Remettre un canvas perdu dans Redis (Écart §7.2, JOURNAL 2026-10-08). Le worker lit la sauvegarde ; ici, les écritures :
// le début (`ready` à 0), les gros morceaux en pipeline, puis `restore.lua` qui finit et pose `ready` en dernier.

import { readFileSync } from "node:fs";
import { toCell, toCellKey } from "@liveplace/domain";
import type { RecoveryMarks, RecoveryTarget, Restoration } from "@liveplace/domain/ports";
import { type CanvasSnapshot, restoreState, type SnapshotCell } from "@liveplace/domain/snapshot";
import type { Redis } from "ioredis";
import { buildCanvasKeys, userKey } from "./keys";
import { formatPileEntry } from "./pile-entry";

const PIPELINE_COMMANDS = 4000; // un lot de commandes par aller-retour : Redis reprend la main entre deux
const SADD_MEMBERS = 2000;

// `ready` à 0, sauf sur un canvas prêt et sur le canvas neuf d'un archivage (sans `ready`, avec `version`) : ni l'un ni l'autre
// n'est perdu. KEYS : `version`, `meta`. Rend 1 quand le canvas est en récupération.
const BEGIN = `local ready = redis.call("HGET", KEYS[2], "ready")
if ready == "1" then return 0 end
if not ready and redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("HSET", KEYS[2], "ready", 0)
return 1`;

// Un canvas dont l'existence a disparu de Convex n'est plus en récupération. KEYS : `meta`.
const CANCEL = `if redis.call("HGET", KEYS[1], "ready") == "0" then redis.call("HDEL", KEYS[1], "ready") end return 1`;

// Lu à l'appel, pas à l'import : le web importe ce module sans jamais restaurer, et son bundle n'a pas le fichier.
let restoreScript: string | undefined;
const getRestoreScript = (): string =>
  (restoreScript ??= readFileSync(new URL("./restore.lua", import.meta.url), "utf8"));

const beginRecovery = async (redis: Redis, canvasId: string): Promise<"begun" | "already_live"> => {
  const keys = buildCanvasKeys(canvasId);
  return (await redis.eval(BEGIN, 2, keys.version, keys.meta)) === 1 ? "begun" : "already_live";
};

// Un lot de commandes d'un pipeline : une erreur de commande remonte, jamais un canvas à moitié remis sans le dire.
const flush = async (pipeline: ReturnType<Redis["pipeline"]>): Promise<void> => {
  for (const [error] of (await pipeline.exec()) ?? []) if (error) throw error;
};

// L'entrée de pile de la tête visible d'une case, et son auteur.
const pileEntryOf = (
  snapshot: CanvasSnapshot,
  [cellKey, authorIndex, placementIndex, colorIndex, placedAt, version]: SnapshotCell,
): { authorId: string; entry: string } => {
  const authorId = snapshot.authors[authorIndex];
  if (authorId === undefined) throw new Error(`case ${cellKey} : auteur ${authorIndex} hors du dictionnaire`);
  const placementId = placementIndex === -1 ? undefined : snapshot.placements[placementIndex];
  const pile = { authorId, colorIndex, placedAt, version };
  return { authorId, entry: formatPileEntry(placementId === undefined ? pile : { ...pile, placementId }) };
};

// Les piles `hist:` à une entrée (la tête visible) et `cells:<userId>` : de quoi inspecter un pixel et retirer ceux d'un auteur.
// Effacées avant d'être écrites : une récupération interrompue puis reprise ne double rien.
const storePiles = async (redis: Redis, canvasId: string, snapshot: CanvasSnapshot): Promise<void> => {
  const keys = buildCanvasKeys(canvasId);
  const cellsByAuthor = new Map<string, number[]>();
  let pipeline = redis.pipeline();
  let commands = 0;
  const count = async (added: number): Promise<void> => {
    commands += added;
    if (commands < PIPELINE_COMMANDS) return;
    await flush(pipeline);
    pipeline = redis.pipeline();
    commands = 0;
  };
  for (const cell of snapshot.cells) {
    const { authorId, entry } = pileEntryOf(snapshot, cell);
    const { x, y } = toCell(cell[0]);
    const histKey = keys.hist(toCellKey(x, y));
    pipeline.del(histKey).lpush(histKey, entry);
    await count(2);
    const known = cellsByAuthor.get(authorId);
    if (known) known.push(cell[0]);
    else cellsByAuthor.set(authorId, [cell[0]]);
  }
  for (const [authorId, cellKeys] of cellsByAuthor) {
    pipeline.del(keys.cells(authorId));
    for (let first = 0; first < cellKeys.length; first += SADD_MEMBERS)
      pipeline.sadd(keys.cells(authorId), ...cellKeys.slice(first, first + SADD_MEMBERS));
    await count(1 + Math.ceil(cellKeys.length / SADD_MEMBERS));
  }
  await flush(pipeline);
};

// Le miroir d'une personne ne remplace pas celui qu'une connexion vient d'écrire.
const storeMirrors = async (redis: Redis, users: Restoration["users"]): Promise<void> => {
  const pipeline = redis.pipeline();
  for (const { userId, login, displayName, avatarUrl } of users) {
    pipeline.hsetnx(userKey(userId), "login", login).hsetnx(userKey(userId), "displayName", displayName);
    if (avatarUrl) pipeline.hsetnx(userKey(userId), "avatarUrl", avatarUrl);
  }
  await flush(pipeline);
};

// Le reste de la sauvegarde, tel que `restore.lua` le lit : les scores et les dates en chaînes, un champ absent d'une
// sauvegarde d'avant le classement vide.
const toPayload = (snapshot: CanvasSnapshot): string =>
  JSON.stringify({
    meta: Object.fromEntries(Object.entries(snapshot.meta).filter(([field]) => field !== "ready")),
    bans: snapshot.bans,
    bansTwitch: snapshot.bansTwitch,
    banProofs: snapshot.banProofs,
    cleared: snapshot.cleared,
    clearedPlacements: snapshot.clearedPlacements,
    clearedRanges: snapshot.clearedRanges,
    mods: snapshot.mods,
    modsTwitch: snapshot.modsTwitch,
    modsLiveplace: snapshot.modsLiveplace,
    twitchUsers: snapshot.twitchUsers,
    reported: snapshot.reported.map(([placementKey, reportedAt]) => [placementKey, String(reportedAt)]),
    reports: snapshot.reports,
    offStream: snapshot.offStream,
    approved: snapshot.approved,
    progress: snapshot.progress,
    scoreboard: snapshot.scoreboard ?? {},
    scoreboardBanned: snapshot.scoreboardBanned ?? {},
  });

export function createRecoveryTarget(redis: Redis): RecoveryTarget {
  return {
    async listLostCanvases(canvasIds) {
      const pipeline = redis.pipeline();
      for (const canvasId of canvasIds) {
        const keys = buildCanvasKeys(canvasId);
        pipeline.exists(keys.version).hget(keys.meta, "ready");
      }
      const replies = (await pipeline.exec()) ?? [];
      for (const [error] of replies) if (error) throw error;
      return canvasIds.filter((_, index) => {
        const exists = replies[index * 2]?.[1];
        const ready = replies[index * 2 + 1]?.[1];
        // Perdu : plus de `version` (sauf un `ready` à 1 qui dit le contraire), ou un `ready` resté à 0.
        return ready === "0" || (exists === 0 && ready !== "1");
      });
    },

    beginRestore: (canvasId) => beginRecovery(redis, canvasId),

    async cancelRestore(canvasId) {
      await redis.eval(CANCEL, 1, buildCanvasKeys(canvasId).meta);
    },

    async restore(canvasId, { snapshot, users, version, at }) {
      const keys = buildCanvasKeys(canvasId);
      if ((await redis.hget(keys.meta, "ready")) !== "0") return "already_live";
      await storePiles(redis, canvasId, snapshot);
      await storeMirrors(redis, users);
      const width = Number(snapshot.meta.width);
      const height = Number(snapshot.meta.height);
      const answer = await redis.eval(
        getRestoreScript(),
        18,
        ...[
          keys.version,
          keys.meta,
          keys.state,
          keys.bans,
          keys.bansTwitch,
          keys.cleared,
          keys.clearedPlacements,
          keys.clearedRanges,
          keys.mods,
          keys.modsTwitch,
          keys.modsLiveplace,
          keys.twitchUsers,
          keys.reported,
          keys.offStream,
          keys.approved,
          keys.scoreboard,
          keys.scoreboardBanned,
          keys.live,
        ],
        keys.prefix,
        version,
        at,
        Buffer.from(restoreState({ width, height }, snapshot.cells)),
        toPayload(snapshot),
        snapshot.version,
      );
      return answer === "restored" ? "restored" : "already_live";
    },
  };
}

// Écart §4.2 (JOURNAL 2026-10-08) : ce que le web écrit au rendu d'une page, avant que le worker ait vu la perte.
export function createRecoveryMarks(redis: Redis): RecoveryMarks {
  return {
    async isCanvasLive(canvasId) {
      return (await redis.exists(buildCanvasKeys(canvasId).version)) === 1;
    },
    async markRecovering(canvasId) {
      await beginRecovery(redis, canvasId);
    },
  };
}
