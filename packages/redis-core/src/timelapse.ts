// Ce que le web lit de Redis pour rejouer l'historique d'un canvas en GIF (JOURNAL 2026-11-11).

import { cornerOf } from "@liveplace/domain";
import type { TimelapseSource } from "@liveplace/domain/ports";
import type { TimelapsePile } from "@liveplace/domain/timelapse";
import type { Redis } from "ioredis";
import { entryOf } from "./history";
import { buildCanvasKeys } from "./keys";
import { parsePileEntry } from "./pile-entry";
import { escapeGlob, fieldsOf, scanNames, stringsOf, valuesOf } from "./replies";
import { tombstonesOf } from "./snapshot";

const PILES_PER_PIPELINE = 1024; // une tranche de piles par aller-retour : Redis reprend la main entre deux
const STREAM_PAGE = 5000; // entrées du flux par XRANGE

export function createTimelapseSource(redis: Redis): TimelapseSource {
  // Chaque pile d'un canvas, de sa plus récente entrée à sa plus ancienne : un SCAN, puis un LRANGE par clé, par tranches.
  const listPiles = async (canvasId: string): Promise<TimelapsePile[]> => {
    const prefix = buildCanvasKeys(canvasId).histPrefix;
    const names: string[] = [];
    for await (const name of scanNames(redis, `${escapeGlob(prefix)}*`)) names.push(name);
    const piles: TimelapsePile[] = [];
    for (let start = 0; start < names.length; start += PILES_PER_PIPELINE) {
      const slice = names.slice(start, start + PILES_PER_PIPELINE);
      const pipeline = redis.pipeline();
      for (const name of slice) pipeline.lrange(name, 0, -1);
      for (const [index, reply] of valuesOf(await pipeline.exec()).entries())
        piles.push({
          cellKey: Number((slice[index] ?? "").slice(prefix.length)),
          entries: stringsOf(reply).map(parsePileEntry),
        });
    }
    return piles;
  };

  return {
    // La version, `meta` et `state` d'un coup : le cadre et l'image sont ceux de cette version. Les piles viennent ensuite, la
    // modération en dernier : une pierre tombale plus récente couvre une entrée de plus, l'inverse laisserait revenir un pixel retiré.
    async getFrame(canvasId) {
      const keys = buildCanvasKeys(canvasId);
      const [version, meta, image] = valuesOf(
        await redis.multi().get(keys.version).hgetall(keys.meta).getBuffer(keys.state).exec(),
      );
      const fields = fieldsOf(meta);
      if (fields.ready !== "1") return null;
      const size = { width: Number(fields.width), height: Number(fields.height) };
      const state = new Uint8Array(size.width * size.height);
      if (Buffer.isBuffer(image)) state.set(image.subarray(0, state.length));
      const piles = await listPiles(canvasId);
      const [cleared, clearedPlacements, clearedRanges] = valuesOf(
        await redis
          .multi()
          .hgetall(keys.cleared)
          .smembers(keys.clearedPlacements)
          .hgetall(keys.clearedRanges)
          .exec(),
      );
      return {
        size,
        corner: cornerOf(fields),
        state,
        maxVersion: Number(version ?? 0),
        piles,
        tombstones: tombstonesOf({
          cleared: fieldsOf(cleared),
          clearedPlacements: stringsOf(clearedPlacements),
          clearedRanges: fieldsOf(clearedRanges),
        }),
      };
    },

    // Les IDs du flux sont des versions (`<version>-0`) : la page suivante part de la version qui suit la dernière lue.
    async *listStreamEntries(canvasId, afterVersion) {
      const { events } = buildCanvasKeys(canvasId);
      let start = `${afterVersion + 1}-0`;
      for (;;) {
        const page = await redis.xrange(events, start, "+", "COUNT", STREAM_PAGE);
        for (const [id, flat] of page) yield entryOf(id, flat);
        const last = page.at(-1);
        if (page.length < STREAM_PAGE || !last) return;
        start = `${Number(last[0].slice(0, last[0].indexOf("-"))) + 1}-0`;
      }
    },
  };
}
