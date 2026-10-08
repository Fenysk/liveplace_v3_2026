// Le fichier d'un snapshot (Écart §7.2, JOURNAL 2026-10-06) : du JSON compressé en brotli, validé à la lecture.

import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants } from "node:zlib";
import { type CanvasSnapshot, SNAPSHOT_SCHEMA_VERSION } from "@liveplace/domain/snapshot";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

const BROTLI_QUALITY = 9; // le 11 par défaut coûte plusieurs secondes sur un grand canvas, pour quelques pour cent de moins
const MAX_DECODED_BYTES = 256 * 1024 * 1024; // un fichier corrompu ne gonfle pas la mémoire du worker

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

const Strings = z.array(z.string());
const Fields = z.record(z.string(), z.string());
const FieldsByKey = z.record(z.string(), Fields);

const SnapshotSchema = z
  .object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
    canvasId: z.string(),
    version: z.number().int().nonnegative(),
    takenAt: z.number(),
    meta: Fields,
    authors: Strings,
    placements: Strings,
    cells: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])),
    progress: FieldsByKey,
    bans: Strings,
    bansTwitch: Strings,
    banProofs: FieldsByKey,
    cleared: Fields,
    clearedPlacements: Strings,
    clearedRanges: Fields,
    mods: Strings,
    modsTwitch: Strings,
    modsLiveplace: Strings,
    twitchUsers: Fields,
    reported: z.array(z.tuple([z.string(), z.number()])),
    reports: z.record(z.string(), Strings),
    offStream: Strings,
    approved: Strings,
    scoreboard: Fields.optional(),
    scoreboardBanned: Fields.optional(),
  })
  // Une case nomme son auteur et sa pose par leur rang : un rang hors des dictionnaires ne se restaure pas.
  .refine(({ cells, authors, placements }) =>
    cells.every(
      ([, authorIndex, placementIndex]) =>
        authorIndex >= 0 &&
        authorIndex < authors.length &&
        placementIndex >= -1 &&
        placementIndex < placements.length,
    ),
  ) satisfies z.ZodType<CanvasSnapshot>;

export async function encodeSnapshot(snapshot: CanvasSnapshot): Promise<Uint8Array> {
  return compress(Buffer.from(JSON.stringify(snapshot)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
  });
}

export type SnapshotDecodeError = "corrupt" | "unsupported_version";

const isOtherVersion = (json: unknown): boolean =>
  typeof json === "object" &&
  json !== null &&
  "schemaVersion" in json &&
  typeof json.schemaVersion === "number" &&
  json.schemaVersion !== SNAPSHOT_SCHEMA_VERSION;

export async function decodeSnapshot(
  bytes: Uint8Array,
): Promise<Result<CanvasSnapshot, SnapshotDecodeError>> {
  let json: unknown;
  try {
    const text = await decompress(bytes, { maxOutputLength: MAX_DECODED_BYTES });
    json = JSON.parse(text.toString("utf8"));
  } catch {
    return { ok: false, error: "corrupt" }; // des octets illisibles se rendent en erreur typée, pas en exception
  }
  if (isOtherVersion(json)) return { ok: false, error: "unsupported_version" };
  const parsed = SnapshotSchema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "corrupt" };
}
