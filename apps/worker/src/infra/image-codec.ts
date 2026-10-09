// Le fichier d'un palier en `state` seul (Écart §7.3, JOURNAL 2026-10-08) : le dessin en base64 dans du JSON compressé en
// brotli, sans auteurs ni modération. Au-delà de 7 jours, un retour en arrière rend ce dessin et rien de plus.

import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants } from "node:zlib";
import { SNAPSHOT_SCHEMA_VERSION, type SnapshotImage } from "@liveplace/domain/snapshot";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

const BROTLI_QUALITY = 9; // comme les snapshots
const MAX_DECODED_BYTES = 256 * 1024 * 1024; // un fichier corrompu ne gonfle pas la mémoire du worker

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

const ImageSchema = z
  .object({
    schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
    canvasId: z.string(),
    version: z.number().int().nonnegative(),
    takenAt: z.number(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    state: z.string(),
  })
  .transform(({ state, ...rest }) => ({ ...rest, state: new Uint8Array(Buffer.from(state, "base64")) }))
  // Un octet par case : un dessin plus court ou plus long que sa taille ne se restaure pas.
  .refine(
    ({ state, width, height }) => state.byteLength === width * height,
  ) satisfies z.ZodType<SnapshotImage>;

export async function encodeImage({ state, ...image }: SnapshotImage): Promise<Uint8Array> {
  const json = JSON.stringify({ ...image, state: Buffer.from(state).toString("base64") });
  return compress(Buffer.from(json), { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } });
}

export async function decodeImage(bytes: Uint8Array): Promise<Result<SnapshotImage, "corrupt">> {
  let json: unknown;
  try {
    json = JSON.parse((await decompress(bytes, { maxOutputLength: MAX_DECODED_BYTES })).toString("utf8"));
  } catch {
    return { ok: false, error: "corrupt" };
  }
  const parsed = ImageSchema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "corrupt" };
}
