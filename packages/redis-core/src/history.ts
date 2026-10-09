// Ce que le worker lit du flux d'un canvas pour en archiver l'historique (Écart §7.2, JOURNAL 2026-10-08).

import type { ChunkEntry, Recovered } from "@liveplace/domain/chunk";
import type { HistorySource } from "@liveplace/domain/ports";
import { RECOVERY_VERSION_JUMP } from "@liveplace/domain/snapshot";
import type { Event } from "@liveplace/protocol";
import type { Redis } from "ioredis";
import { buildCanvasKeys } from "./keys";
import { watchLive } from "./live-watch";

// Les champs à plat d'une entrée du flux : `e`, l'événement de nos scripts Lua ; `p`, la pose, absent d'une modération et
// d'une entrée d'avant le champ.
const fieldOf = (flat: string[], name: string): string | undefined => {
  for (let at = 0; at < flat.length; at += 2) if (flat[at] === name) return flat[at + 1];
  return undefined;
};

// L'ID du flux est la version (§5.2).
const entryOf = (id: string, flat: string[]): ChunkEntry => {
  const raw = fieldOf(flat, "e");
  if (raw === undefined) throw new Error(`entrée ${id} du flux sans événement`);
  const event: Event = JSON.parse(raw);
  return [Number(id.slice(0, id.indexOf("-"))), fieldOf(flat, "p") ?? null, event];
};

// Les champs de `meta` qui disent la dernière récupération, dans l'ordre de `toRecovered`.
const RECOVERY_FIELDS = ["recoveredAt", "recoveredAtVersion", "recoveredSnapshotVersion"] as const;

// Une récupération d'avant `recoveredSnapshotVersion` n'a pas la version de sa sauvegarde : la reprise vaut toujours
// max(sauvegarde, curseur) + RECOVERY_VERSION_JUMP, donc retirer le saut rend la sauvegarde dès qu'elle dépasse le curseur, seul
// cas où le chunk d'après la note.
const toRecovered = ([at, version, snapshotVersion]: readonly (string | null)[]): Recovered | null =>
  at == null || version == null
    ? null
    : {
        at: Number(at),
        version: Number(version),
        snapshotVersion:
          snapshotVersion == null ? Number(version) - RECOVERY_VERSION_JUMP : Number(snapshotVersion),
      };

export function createHistorySource(redis: Redis, subscriber: Redis): HistorySource {
  return {
    async getVersion(canvasId) {
      const version = await redis.get(buildCanvasKeys(canvasId).version);
      return version === null ? null : Number(version);
    },

    async getRecovery(canvasId) {
      const [at, version] = await redis.hmget(
        buildCanvasKeys(canvasId).meta,
        "recoveredAt",
        "recoveredAtVersion",
      );
      return at === null || version === null ? null : { at: Number(at), version: Number(version) };
    },

    // La version suivante, pas le curseur : un XRANGE inclusif, sans `(` ni groupe de consommateurs.
    async listHistory(canvasId, afterVersion, maxCount) {
      const keys = buildCanvasKeys(canvasId);
      const [entries, [resizedAtVersion, ...recovery]] = await Promise.all([
        redis.xrange(keys.events, `${afterVersion + 1}-0`, "+", "COUNT", maxCount),
        redis.hmget(keys.meta, "resizedAtVersion", ...RECOVERY_FIELDS),
      ]);
      return {
        entries: entries.map(([id, flat]) => entryOf(id, flat)),
        resizedAtVersion: resizedAtVersion === null ? null : Number(resizedAtVersion),
        recovered: toRecovered(recovery),
      };
    },

    watch: (onActivity) => watchLive(subscriber, onActivity),
  };
}
