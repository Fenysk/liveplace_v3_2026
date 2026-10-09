// Ce que le worker lit de Redis pour sauvegarder un canvas (Écart §7.2, JOURNAL 2026-10-06).

import { CANVAS_HEIGHT, CANVAS_WIDTH, type CellKey, toCellKey } from "@liveplace/domain";
import type { SnapshotSource } from "@liveplace/domain/ports";
import {
  type CanvasSnapshot,
  isCovered,
  type PileEntry,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotCell,
  type Tombstones,
} from "@liveplace/domain/snapshot";
import type { ChainableCommander, Redis } from "ioredis";
import { buildCanvasKeys, toPlacementKey } from "./keys";
import { watchLive } from "./live-watch";
import { parsePileEntry } from "./pile-entry";

const HEADS_PER_PIPELINE = 2048; // une tranche de têtes de pile par aller-retour : Redis reprend la main entre deux
const SCAN_COUNT = 1000;
const META_KEY = /^cv:([^:]+):meta$/;
const PROGRESS_KEY = /^cv:([^:]+):progress:(.+)$/;

type CanvasKeys = ReturnType<typeof buildCanvasKeys>;
type Replies = [Error | null, unknown][];

// La réponse d'un pipeline ou d'un MULTI, une valeur par commande : une erreur de commande remonte.
const valuesOf = (replies: Replies | null): unknown[] => {
  if (!replies) throw new Error("transaction annulée");
  return replies.map(([error, value]) => {
    if (error) throw error;
    return value;
  });
};

const stringsOf = (reply: unknown): string[] => {
  if (!Array.isArray(reply) || !reply.every((item) => typeof item === "string"))
    throw new Error("réponse Redis : une liste de chaînes était attendue");
  return reply;
};

const fieldsOf = (reply: unknown): Record<string, string> => {
  const isHash =
    typeof reply === "object" &&
    reply !== null &&
    Object.values(reply).every((value) => typeof value === "string");
  if (!isHash) throw new Error("réponse Redis : un hash de chaînes était attendu");
  return Object.fromEntries(Object.entries(reply));
};

// `ZRANGE … WITHSCORES` rend `[membre, score, membre, score…]`.
const pairsOf = (reply: unknown): [member: string, score: string][] => {
  const flat = stringsOf(reply);
  return Array.from({ length: flat.length / 2 }, (_, index): [string, string] => [
    flat[index * 2] ?? "",
    flat[index * 2 + 1] ?? "",
  ]);
};

const scoredOf = (reply: unknown): [member: string, score: number][] =>
  pairsOf(reply).map(([member, score]) => [member, Number(score)]);

// Le score tel que Redis le rend : une chaîne, que la restauration réécrit sans le convertir.
const scoresOf = (reply: unknown): Record<string, string> => Object.fromEntries(pairsOf(reply));

// Ce que le MULTI lit d'un coup : tout ce qui est petit, borné par la modération et par le classement, non par les pixels.
type SmallParts = Omit<
  CanvasSnapshot,
  | "schemaVersion"
  | "canvasId"
  | "version"
  | "takenAt"
  | "authors"
  | "placements"
  | "cells"
  | "progress"
  | "banProofs"
  | "reports"
> &
  Required<Pick<CanvasSnapshot, "scoreboard" | "scoreboardBanned">>;

const listSmallParts = async (redis: Redis, keys: CanvasKeys): Promise<SmallParts> => {
  const [
    meta,
    bans,
    bansTwitch,
    cleared,
    clearedPlacements,
    clearedRanges,
    mods,
    modsTwitch,
    modsLiveplace,
    twitchUsers,
    reported,
    offStream,
    approved,
    scoreboard,
    scoreboardBanned,
  ] = valuesOf(
    await redis
      .multi()
      .hgetall(keys.meta)
      .smembers(keys.bans)
      .smembers(keys.bansTwitch)
      .hgetall(keys.cleared)
      .smembers(keys.clearedPlacements)
      .hgetall(keys.clearedRanges)
      .smembers(keys.mods)
      .smembers(keys.modsTwitch)
      .smembers(keys.modsLiveplace)
      .hgetall(keys.twitchUsers)
      .zrange(keys.reported, "0", "-1", "WITHSCORES")
      .smembers(keys.offStream)
      .smembers(keys.approved)
      .zrange(keys.scoreboard, "0", "-1", "WITHSCORES")
      .hgetall(keys.scoreboardBanned)
      .exec(),
  );
  return {
    meta: Object.fromEntries(Object.entries(fieldsOf(meta)).filter(([field]) => field !== "ready")),
    bans: stringsOf(bans),
    bansTwitch: stringsOf(bansTwitch),
    cleared: fieldsOf(cleared),
    clearedPlacements: stringsOf(clearedPlacements),
    clearedRanges: fieldsOf(clearedRanges),
    mods: stringsOf(mods),
    modsTwitch: stringsOf(modsTwitch),
    modsLiveplace: stringsOf(modsLiveplace),
    twitchUsers: fieldsOf(twitchUsers),
    reported: scoredOf(reported),
    offStream: stringsOf(offStream),
    approved: stringsOf(approved),
    scoreboard: scoresOf(scoreboard),
    scoreboardBanned: fieldsOf(scoreboardBanned),
  };
};

// Une plage retirée, `[from, to]`, telle que moderate.lua l'écrit dans `cleared:ranges`.
const tombstonesOf = ({ cleared, clearedPlacements, clearedRanges }: SmallParts): Tombstones => ({
  clearedVersions: new Map(Object.entries(cleared).map(([author, version]) => [author, Number(version)])),
  clearedPlacements: new Set(clearedPlacements),
  clearedRanges: new Map(Object.entries(clearedRanges).map(([author, raw]) => [author, JSON.parse(raw)])),
});

const placementKeyOf = (entry: PileEntry): string =>
  toPlacementKey({ authorId: entry.authorId, placementId: entry.placementId ?? String(entry.version) });

// §5.3 : un canvas redimensionné garde des piles hors du cadre, jusqu'à la plus grande taille ; sinon son cadre suffit.
const extentOf = (fields: Record<string, string>): { width: number; height: number } =>
  fields.resizedAtVersion === undefined
    ? { width: Number(fields.width), height: Number(fields.height) }
    : { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

// La tête de chaque pile de l'étendue : le pixel visible, ou rien. Lue avant les pierres tombales, jamais après : une
// pierre tombale plus récente que la tête la couvre, l'inverse laisserait revenir un pixel retiré.
const listHeads = async (
  redis: Redis,
  keys: CanvasKeys,
  fields: Record<string, string>,
): Promise<[CellKey, string][]> => {
  const { width, height } = extentOf(fields);
  const cellKeys = Array.from({ length: width * height }, (_, index) =>
    toCellKey(index % width, Math.floor(index / width)),
  );
  const heads: [CellKey, string][] = [];
  for (let start = 0; start < cellKeys.length; start += HEADS_PER_PIPELINE) {
    const slice = cellKeys.slice(start, start + HEADS_PER_PIPELINE);
    const pipeline = redis.pipeline();
    for (const cellKey of slice) pipeline.lindex(keys.hist(cellKey), 0);
    valuesOf(await pipeline.exec()).forEach((head, index) => {
      const cellKey = slice[index];
      if (typeof head === "string" && cellKey !== undefined) heads.push([cellKey, head]);
    });
  }
  return heads;
};

// Une tête couverte par une pierre tombale (un retrait interrompu) : c'est la première entrée du dessous qui ne l'est pas.
const visibleEntryOf = async (
  redis: Redis,
  keys: CanvasKeys,
  [cellKey, head]: [CellKey, string],
  tombstones: Tombstones,
): Promise<PileEntry | null> => {
  const first = parsePileEntry(head);
  if (!isCovered(first, placementKeyOf(first), tombstones)) return first;
  const pile = (await redis.lrange(keys.hist(cellKey), 0, -1)).map(parsePileEntry);
  return pile.find((entry) => !isCovered(entry, placementKeyOf(entry), tombstones)) ?? null;
};

// Deux dictionnaires rendent un rang : un auteur ou une pose revient sur des centaines de cases.
const createDictionary = () => {
  const values: string[] = [];
  const ranks = new Map<string, number>();
  const rankOf = (value: string): number => {
    const known = ranks.get(value);
    if (known !== undefined) return known;
    ranks.set(value, values.length);
    values.push(value);
    return values.length - 1;
  };
  return { values, rankOf };
};

const listCells = async (
  redis: Redis,
  keys: CanvasKeys,
  heads: [CellKey, string][],
  tombstones: Tombstones,
) => {
  const authors = createDictionary();
  const placements = createDictionary();
  const cells: SnapshotCell[] = [];
  for (const head of heads) {
    const entry = await visibleEntryOf(redis, keys, head, tombstones);
    if (!entry) continue;
    const placementRank = entry.placementId === undefined ? -1 : placements.rankOf(entry.placementId);
    cells.push([
      head[0],
      authors.rankOf(entry.authorId),
      placementRank,
      entry.colorIndex,
      entry.placedAt,
      entry.version,
    ]);
  }
  return { cells, authors: authors.values, placements: placements.values };
};

// Une commande par clé, en un seul aller-retour.
const listEach = async <Reply>(
  redis: Redis,
  names: string[],
  command: (pipeline: ChainableCommander, name: string) => void,
  parse: (reply: unknown) => Reply,
): Promise<Reply[]> => {
  const pipeline = redis.pipeline();
  for (const name of names) command(pipeline, name);
  return valuesOf(await pipeline.exec()).map(parse);
};

// Les clés d'un hash par entrée : une entrée sans champ n'existe pas dans Redis, elle n'entre pas dans le snapshot.
const hashesByKey = (
  ids: string[],
  hashes: Record<string, string>[],
): Record<string, Record<string, string>> =>
  Object.fromEntries(
    ids.flatMap((id, index): [string, Record<string, string>][] => {
      const hash = hashes[index];
      return hash && Object.keys(hash).length > 0 ? [[id, hash]] : [];
    }),
  );

// Un identifiant de canvas n'est jamais un motif : les caractères de SCAN y perdent leur sens.
const escapeGlob = (name: string): string => name.replace(/[\\*?[\]]/g, "\\$&");

// Les clés qui correspondent au motif, sans jamais bloquer Redis : un curseur, quelques milliers de clés par tour.
async function* scanNames(redis: Redis, match: string): AsyncGenerator<string> {
  for await (const names of redis.scanStream({ match, count: SCAN_COUNT })) yield* names;
}

export function createSnapshotSource(redis: Redis, subscriber: Redis): SnapshotSource {
  return {
    // Écart §7.1 (JOURNAL 2026-10-06) : deux balayages de Redis pour tous les canvas, jamais un par canvas : chacun
    // relirait tout l'espace de clés. Les canvas viennent de `meta` : l'un d'avant la progression n'a aucun joueur.
    async listCanvases() {
      const found = new Map<string, Set<string>>();
      for await (const name of scanNames(redis, "cv:*:meta")) {
        const canvasId = META_KEY.exec(name)?.[1];
        if (canvasId !== undefined) found.set(canvasId, new Set());
      }
      for await (const name of scanNames(redis, "cv:*:progress:*")) {
        const [, canvasId, userId] = PROGRESS_KEY.exec(name) ?? [];
        if (canvasId !== undefined && userId !== undefined) found.get(canvasId)?.add(userId);
      }
      return new Map([...found].map(([canvasId, userIds]) => [canvasId, [...userIds]]));
    },

    async getVersion(canvasId) {
      const version = await redis.get(buildCanvasKeys(canvasId).version);
      return version === null ? null : Number(version);
    },

    // Les joueurs d'un canvas que le balayage n'a pas encore vu : le canvas neuf d'un archivage, qui recopie la progression.
    async listPlayers(canvasId) {
      const found: string[] = [];
      const prefix = buildCanvasKeys(canvasId).progress("");
      for await (const name of scanNames(redis, `${escapeGlob(prefix)}*`))
        found.push(name.slice(prefix.length));
      return found;
    },

    async getSuccessorId(canvasId) {
      return redis.hget(buildCanvasKeys(canvasId).meta, "successorId");
    },

    // La version se lit avant tout le reste : le contenu est au moins aussi récent qu'elle. Une pose qui arrive pendant
    // la lecture fait repartir un snapshot (le worker la voit passer), elle ne rend jamais celui-ci faux.
    async getCanvasSnapshot(canvasId, players, takenAt) {
      const keys = buildCanvasKeys(canvasId);
      const version = Number((await redis.get(keys.version)) ?? 0);
      const early = await redis.hgetall(keys.meta);
      if (early.ready !== "1") return null;

      // Version 0 : aucune pile à lire, mais la modération et la progression recopiées par un archivage valent d'être gardées.
      const heads = version === 0 ? [] : await listHeads(redis, keys, early);
      const parts = await listSmallParts(redis, keys);
      const { cells, authors, placements } = await listCells(redis, keys, heads, tombstonesOf(parts));
      const playerIds = [...new Set([...players, ...authors])];
      const hash = (pipeline: ChainableCommander, name: string) => pipeline.hgetall(name);
      const [progress, proofs, reporters] = await Promise.all([
        listEach(
          redis,
          playerIds.map((userId) => keys.progress(userId)),
          hash,
          fieldsOf,
        ),
        listEach(
          redis,
          parts.bans.map((userId) => keys.ban(userId)),
          hash,
          fieldsOf,
        ),
        listEach(
          redis,
          parts.reported.map(([placementKey]) => keys.reports(placementKey)),
          (pipeline, name) => pipeline.smembers(name),
          stringsOf,
        ),
      ]);

      const progressByPlayer = hashesByKey(playerIds, progress);
      const isUntouched =
        version === 0 &&
        parts.bans.length === 0 &&
        parts.mods.length === 0 &&
        Object.keys(progressByPlayer).length === 0;
      if (isUntouched) return null;

      return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        canvasId,
        version,
        takenAt,
        ...parts,
        authors,
        placements,
        cells,
        progress: progressByPlayer,
        banProofs: Object.fromEntries(parts.bans.map((userId, index) => [userId, proofs[index] ?? {}])),
        reports: Object.fromEntries(
          parts.reported.map(([placementKey], index) => [placementKey, reporters[index] ?? []]),
        ),
      };
    },

    watch: (onActivity) => watchLive(subscriber, onActivity),
  };
}
