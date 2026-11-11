import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelapseProgressLine } from "./timelapse-lines";
import { streamTimelapse } from "./timelapse-stream";

const encoder = new TextEncoder();

const WIRE = { width: 10, height: 8, initial: "AAA=", changes: "BBB=" };

// Un corps dont les morceaux d'octets arrivent comme le test les pose : `push` puis `close`.
const openBody = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  return {
    body,
    push: (bytes: Uint8Array | string) =>
      controller?.enqueue(typeof bytes === "string" ? encoder.encode(bytes) : bytes),
    close: () => controller?.close(),
  };
};

const setup = (response: Response | Error | ReadableStream<Uint8Array>) => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({ url: String(url), init });
    if (response instanceof Error) throw response;
    return response instanceof ReadableStream ? new Response(response) : response;
  };
  const progress: TimelapseProgressLine[] = [];
  const abort = new AbortController();
  const run = streamTimelapse("canvas-1", {
    send,
    signal: abort.signal,
    onProgress: (step) => progress.push(step),
  });
  return { run, sent, progress, abort };
};

const lines = (...texts: string[]): string => texts.map((text) => `${text}\n`).join("");
const STREAM = '{"kind":"progress","step":"stream","poses":1104}';
const CHUNKS = (done: number) => `{"kind":"progress","step":"chunks","done":${done},"total":140}`;
const DONE = `{"kind":"done","value":${JSON.stringify(WIRE)}}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("la lecture du flux du GIF timelapse dans le navigateur (JOURNAL 2026-11-11)", () => {
  // Quand la page ouvre la lecture, alors un POST JSON vers la route, avec le cookie, et un signal pour l'annuler.
  it("posts the canvas id to the route with the cookie and a cancel signal", async () => {
    const { body, push, close } = openBody();
    const { run, sent } = setup(body);
    push(lines(DONE));
    close();
    await run;

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("/dev/timelapse");
    expect(sent[0]?.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: '{"canvasId":"canvas-1"}',
    });
    expect(sent[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  // Quand les lignes arrivent, alors chaque progression passe à la page dans l'ordre, puis `done` rend le GIF à dessiner.
  it("hands each progress to the page in order, then the wire on done", async () => {
    const { body, push, close } = openBody();
    const { run, progress } = setup(body);

    push(lines(STREAM, CHUNKS(0), CHUNKS(12), DONE));
    close();

    expect(await run).toEqual({ kind: "done", value: WIRE });
    expect(progress).toEqual([
      { kind: "progress", step: "stream", poses: 1104 },
      { kind: "progress", step: "chunks", done: 0, total: 140 },
      { kind: "progress", step: "chunks", done: 12, total: 140 },
    ]);
  });

  // Quand une ligne arrive coupée entre deux morceaux d'octets, alors elle se relit entière, même au milieu d'un caractère.
  it("reassembles a line cut between two chunks of bytes, even inside a character", async () => {
    const { body, push, close } = openBody();
    const { run, progress } = setup(body);
    const failed = encoder.encode('{"kind":"failed","error":"é"}\n');
    const accent = failed.indexOf(0xc3) + 1; // au milieu des deux octets de « é »

    push(lines(STREAM).slice(0, 20));
    push(`${lines(STREAM).slice(20)}{"kind":"prog`);
    push(`ress","step":"chunks","done":3,"total":9}\n`);
    push(failed.slice(0, accent));
    push(failed.slice(accent));
    close();

    expect(await run).toEqual({ kind: "failed", error: "é" });
    expect(progress).toEqual([
      { kind: "progress", step: "stream", poses: 1104 },
      { kind: "progress", step: "chunks", done: 3, total: 9 },
    ]);
  });

  // Quand le serveur finit par `failed`, alors la page reçoit son erreur, quel que soit le code HTTP.
  it("returns the error of a failed line, whatever the HTTP status", async () => {
    const answer = new Response(lines('{"kind":"failed","error":"history_timeout"}'), { status: 403 });

    expect(await setup(answer).run).toEqual({ kind: "failed", error: "history_timeout" });
  });

  // Si le flux se ferme avant `done` ou `failed`, alors la connexion est coupée.
  it("reports a cut when the stream closes before done or failed", async () => {
    const { body, push, close } = openBody();
    const { run } = setup(body);

    push(lines(STREAM, CHUNKS(5)));
    close();

    expect(await run).toEqual({ kind: "cut" });
  });

  // Si le flux se ferme au milieu d'une ligne, alors la connexion est coupée : une ligne sans fin n'est pas lue.
  it("reports a cut when the last line has no end", async () => {
    const { body, push, close } = openBody();
    const { run } = setup(body);

    push(`${lines(STREAM)}${DONE}`);
    close();

    expect(await run).toEqual({ kind: "cut" });
  });

  // Si la requête échoue (réseau, serveur redémarré), ou si la réponse n'a pas de corps, alors la connexion est coupée.
  it("reports a cut when the request fails or the answer has no body", async () => {
    expect(await setup(new TypeError("Failed to fetch")).run).toEqual({ kind: "cut" });
    expect(await setup(new Response(null, { status: 502 })).run).toEqual({ kind: "cut" });
  });

  // Si une ligne n'est pas du contrat (une page d'erreur d'un proxy), alors elle est journalisée et la lecture continue.
  it("logs a line out of the contract and goes on", async () => {
    const { body, push, close } = openBody();
    const { run } = setup(body);

    push(lines("<html>502 Bad Gateway</html>", DONE));
    close();

    expect(await run).toEqual({ kind: "done", value: WIRE });
    expect(console.error).toHaveBeenCalled();
  });

  // Si aucun octet n'arrive pendant 60 s, alors la requête est annulée et la lecture rend `silent`.
  it("cancels the request and reports silence after 60 seconds without a byte", async () => {
    vi.useFakeTimers();
    const { body } = openBody();
    const { run, sent } = setup(body);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(sent[0]?.init?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await run).toEqual({ kind: "silent" });
    expect(sent[0]?.init?.signal?.aborted).toBe(true);
  });

  // Quand des octets arrivent, même sans ligne entière, alors les 60 s repartent de zéro.
  it("restarts the 60 seconds at every byte, even a partial line", async () => {
    vi.useFakeTimers();
    const { body, push, close } = openBody();
    const { run } = setup(body);

    await vi.advanceTimersByTimeAsync(59_000);
    push(lines(STREAM).slice(0, 10));
    await vi.advanceTimersByTimeAsync(59_000);
    push(lines(STREAM).slice(10));
    await vi.advanceTimersByTimeAsync(59_000);
    push(lines(DONE));
    close();

    expect(await run).toEqual({ kind: "done", value: WIRE });
  });

  // Quand la page annule (fenêtre fermée), alors la requête part annulée et la lecture ne rend jamais `silent`.
  it("cancels the request when the page does", async () => {
    const { body } = openBody();
    const { run, sent, abort } = setup(body);

    abort.abort();

    expect(await run).toEqual({ kind: "cut" });
    expect(sent[0]?.init?.signal?.aborted).toBe(true);
  });
});
