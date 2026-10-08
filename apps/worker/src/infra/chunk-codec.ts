// Le `payload` d'un chunk (Écart §7.2, JOURNAL 2026-10-08) : du JSON compressé en brotli, validé à la lecture.

import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants } from "node:zlib";
import { CHUNK_SCHEMA_VERSION, type Chunk } from "@liveplace/domain/chunk";
import type { Event } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

const BROTLI_QUALITY = 9; // comme les snapshots : le 11 par défaut coûte plusieurs secondes pour quelques pour cent de moins
const MAX_DECODED_BYTES = 256 * 1024 * 1024; // un fichier corrompu ne gonfle pas la mémoire du worker
const EVENT_KINDS: readonly unknown[] = ["place", "clear", "hide", "unhide"];

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

// L'événement est celui de nos scripts Lua : on vérifie ce dont la lecture dépend, pas chaque case.
const isEvent = (value: unknown): value is Event =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  Number.isInteger(value.version) &&
  "kind" in value &&
  EVENT_KINDS.includes(value.kind) &&
  "occurredAt" in value &&
  typeof value.occurredAt === "number" &&
  "cells" in value &&
  Array.isArray(value.cells);

const EntrySchema = z.tuple([
  z.number().int().nonnegative(),
  z.string().nullable(),
  z.custom<Event>(isEvent),
]);

const ChunkSchema = z
  .object({
    schemaVersion: z.literal(CHUNK_SCHEMA_VERSION),
    canvasId: z.string(),
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().nonnegative(),
    entries: z.array(EntrySchema),
  })
  // Les versions croissent de `fromVersion` à `toVersion`, des trous permis ; une entrée dit la version de son événement.
  .refine(
    ({ fromVersion, toVersion, entries }) =>
      entries.length > 0 &&
      entries[0]?.[0] === fromVersion &&
      entries.at(-1)?.[0] === toVersion &&
      entries.every(
        ([version, , event], index) => event.version === version && version > (entries[index - 1]?.[0] ?? -1),
      ),
  ) satisfies z.ZodType<Chunk>;

export async function encodeChunk(chunk: Chunk): Promise<Uint8Array> {
  return compress(Buffer.from(JSON.stringify(chunk)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  });
}

export type ChunkDecodeError = "corrupt" | "unsupported_version";

const isOtherVersion = (json: unknown): boolean =>
  typeof json === "object" &&
  json !== null &&
  "schemaVersion" in json &&
  typeof json.schemaVersion === "number" &&
  json.schemaVersion !== CHUNK_SCHEMA_VERSION;

export async function decodeChunk(bytes: Uint8Array): Promise<Result<Chunk, ChunkDecodeError>> {
  let json: unknown;
  try {
    const text = await decompress(bytes, { maxOutputLength: MAX_DECODED_BYTES });
    json = JSON.parse(text.toString("utf8"));
  } catch {
    return { ok: false, error: "corrupt" }; // des octets illisibles se rendent en erreur typée, pas en exception
  }
  if (isOtherVersion(json)) return { ok: false, error: "unsupported_version" };
  const parsed = ChunkSchema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "corrupt" };
}
