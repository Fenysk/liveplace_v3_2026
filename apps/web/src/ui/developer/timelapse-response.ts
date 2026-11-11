// `POST /dev/timelapse` : le GIF timelapse du développeur, en flux NDJSON (JOURNAL 2026-11-11), une ligne dès qu'elle arrive. Séparé de
// la route pour se tester sans routeur. Le cookie `lp_session` fait foi, avant toute lecture ; jamais un paramètre.

import type { SessionVerifier } from "@liveplace/domain/ports";
import { z } from "zod";
import { CanvasIdSchema } from "../../routes/-owner-canvases";
import { isFromOurPage } from "../../shared/same-origin";
import { type ExportTimelapseDeps, exportTimelapseAsDeveloper } from "../../usecase/export-timelapse";
import { encodeLine, type TimelapseLine } from "./timelapse-lines";

export type TimelapseResponseDeps = ExportTimelapseDeps & {
  verifier: SessionVerifier;
  publicUrl: string; // l'adresse du site : derrière Traefik, la requête arrive en http, c'est elle qui dit l'origine
};

const RequestSchema = z.object({ canvasId: CanvasIdSchema });

// Aucun proxy ni cache ne garde les lignes : `no-transform` et `X-Accel-Buffering` (nginx).
const HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
};

// Le code HTTP ne dit que le refus d'accès ; tout le reste est une ligne `failed` d'un flux qui répond 200.
const SESSION_REFUSAL_STATUSES: Record<string, number> = { unauthenticated: 401, forbidden: 403 };

const statusOf = (first: TimelapseLine): number =>
  first.kind === "failed" ? (SESSION_REFUSAL_STATUSES[first.error] ?? 200) : 200;

const bytesOf = (line: TimelapseLine): Uint8Array<ArrayBuffer> => new TextEncoder().encode(encodeLine(line));

const refusal = (status: number, error: string): Response =>
  new Response(bytesOf({ kind: "failed", error }), { status, headers: HEADERS });

export async function timelapseResponse(
  { source, chunks, verifier, publicUrl }: TimelapseResponseDeps,
  request: Request,
): Promise<Response> {
  if (!isFromOurPage(request, publicUrl)) return refusal(403, "forbidden");
  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return refusal(400, "invalid_request");

  // Fermer la connexion (le corps est annulé) arrête la lecture comme l'abandon de la requête : entre deux chunks.
  const cancel = new AbortController();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let isClosed = false;
  let sendFirst: (line: TimelapseLine) => void = () => undefined;
  const first = new Promise<TimelapseLine>((resolve) => {
    sendFirst = resolve;
  });
  const emit = (line: TimelapseLine): void => {
    sendFirst(line);
    if (!isClosed) controller?.enqueue(bytesOf(line));
  };
  const stream = new ReadableStream<Uint8Array>({
    start: (started) => {
      controller = started;
    },
    cancel: () => {
      isClosed = true;
      cancel.abort();
    },
  });

  exportTimelapseAsDeveloper(
    { source, chunks, verifier },
    request.headers.get("cookie") ?? undefined,
    body.data.canvasId,
    {
      signal: AbortSignal.any([request.signal, cancel.signal]),
      onProgress: (progress) => emit({ kind: "progress", ...progress }),
    },
  )
    .then(
      (result): TimelapseLine =>
        result.ok ? { kind: "done", value: result.value } : { kind: "failed", error: result.error },
      (error: unknown): TimelapseLine => {
        console.error("timelapse : lecture en échec", error);
        return { kind: "failed", error: "failed" };
      },
    )
    .then((last) => {
      emit(last);
      if (!isClosed) controller?.close();
      isClosed = true;
    });

  // La première ligne dit le code : un refus de session arrive seul, avant toute lecture ; sinon la lecture a commencé.
  return new Response(stream, { status: statusOf(await first), headers: HEADERS });
}
