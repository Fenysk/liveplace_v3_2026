// La lecture de `POST /dev/timelapse` dans le navigateur (JOURNAL 2026-11-11) : le corps arrive ligne par ligne, chaque progression part à
// la page dès qu'elle est lue. Annuler `signal` coupe la requête ; 60 s sans un octet la coupent aussi.

import type { TimelapseWire } from "../../usecase/export-timelapse";
import { parseLine, type TimelapseProgressLine } from "./timelapse-lines";
import { TIMELAPSE_SILENCE_MS } from "./timelapse-summary";

// `cut` : la connexion s'est fermée avant `done` ou `failed` (réseau, serveur redémarré), ou la page a annulé. `silent` : 60 s sans octet.
export type TimelapseStreamEnd =
  | { kind: "done"; value: TimelapseWire }
  | { kind: "failed"; error: string }
  | { kind: "cut" }
  | { kind: "silent" };

type StreamOptions = {
  send: typeof fetch;
  signal: AbortSignal;
  onProgress: (progress: TimelapseProgressLine) => void;
};

const watchSilence = (onSilence: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    reset: (): void => {
      clearTimeout(timer);
      timer = setTimeout(onSilence, TIMELAPSE_SILENCE_MS);
    },
    stop: (): void => clearTimeout(timer),
  };
};

// Les lignes entières du corps, à mesure des morceaux d'octets ; un reste sans fin de ligne n'est jamais lu. `onBytes` : à chaque morceau.
async function* linesOf(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onBytes: () => void,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    onBytes();
    const texts = (pending + decoder.decode(value, { stream: true })).split("\n");
    pending = texts.pop() ?? "";
    yield* texts;
  }
}

// `null` : le corps s'est fini sans `done` ni `failed`.
async function waitForEnd(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
  onBytes: () => void,
  onProgress: StreamOptions["onProgress"],
): Promise<TimelapseStreamEnd | null> {
  if (!body) return null;
  const reader = body.getReader();
  // Un vrai `fetch` coupe son corps à l'annulation ; ceci finit aussi la lecture en cours, quel que soit le corps. Le corps déjà
  // en erreur refuse l'annulation : la lecture en cours le dit déjà.
  const cancelRead = (): void => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancelRead, { once: true });
  if (signal.aborted) cancelRead();
  for await (const text of linesOf(reader, onBytes)) {
    const line = parseLine(text);
    if (line?.kind === "progress") onProgress(line);
    else if (line) return line;
  }
  return null;
}

export async function streamTimelapse(
  canvasId: string,
  { send, signal, onProgress }: StreamOptions,
): Promise<TimelapseStreamEnd> {
  const request = new AbortController();
  const stop = (): void => request.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  let isSilent = false;
  const silence = watchSilence(() => {
    isSilent = true;
    request.abort();
  });
  silence.reset();
  try {
    const response = await send("/dev/timelapse", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvasId }),
      signal: request.signal,
    });
    const end = await waitForEnd(response.body, request.signal, silence.reset, onProgress);
    if (end) return end;
  } catch (error) {
    if (!isSilent && !signal.aborted) console.error("timelapse : lecture du flux interrompue", error);
  } finally {
    silence.stop();
    signal.removeEventListener("abort", stop);
  }
  return { kind: isSilent ? "silent" : "cut" };
}
