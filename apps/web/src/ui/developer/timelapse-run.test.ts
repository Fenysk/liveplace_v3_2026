import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerReply, WorkerRequest } from "./timelapse-messages";
import { startTimelapse, TIMELAPSE_START, type TimelapseState } from "./timelapse-run";

const encoder = new TextEncoder();
const WIRE = { width: 10, height: 8, initial: "AAA=", changes: "BBB=" };

const STREAM = '{"kind":"progress","step":"stream","poses":1104}';
const CHUNKS = (done: number) => `{"kind":"progress","step":"chunks","done":${done},"total":2}`;
const DONE = `{"kind":"done","value":${JSON.stringify(WIRE)}}`;
const FAILED = (error: string) => `{"kind":"failed","error":"${error}"}`;

// Le Worker du dessin, remplacé : le test lui répond comme le ferait `timelapse-worker.ts`.
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: WorkerRequest[] = [];
  isTerminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: WorkerRequest): void {
    this.posted.push(request);
  }
  terminate(): void {
    this.isTerminated = true;
  }
  reply(data: WorkerReply): void {
    this.onmessage?.(new MessageEvent<WorkerReply>("message", { data }));
  }
}

// Le corps de la réponse du serveur : les lignes arrivent quand le test les pousse.
const setup = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const send = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({ url: String(url), init });
    return new Response(body);
  };
  const states: TimelapseState[] = [];
  const stop = startTimelapse("canvas-1", "kalyss", (state) => states.push(state), send);
  return {
    states,
    stop,
    sent,
    push: (...texts: string[]) =>
      controller?.enqueue(encoder.encode(texts.map((text) => `${text}\n`).join(""))),
    close: () => controller?.close(),
    worker: () => FakeWorker.instances[0],
    last: () => states.at(-1),
  };
};

// Laisse les lectures du flux et les promesses finir, sans avancer l'horloge.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 11, 12) });
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("document", {
    createElement: () => ({ dataset: {}, hidden: false, remove: () => undefined }),
    body: { append: () => undefined },
  });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => " #e4e2e7" }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("la génération du GIF timelapse dans la page (JOURNAL 2026-11-11)", () => {
  // Avant la première ligne, la fenêtre part d'une lecture sans rien de connu, à zéro seconde.
  it("starts from a reading with nothing known, at zero seconds", () => {
    expect(TIMELAPSE_START).toEqual({ kind: "reading", seconds: 0, poses: null, chunks: null });
  });

  // Quand les lignes arrivent, alors la lecture passe par le flux et les chunks, puis le dessin, puis le GIF prêt.
  it("goes through the stream, the chunks, the drawing and the ready GIF", async () => {
    const { states, push, worker } = setup();

    push(STREAM, CHUNKS(0), CHUNKS(1), CHUNKS(2));
    await settle();
    push(DONE);
    await settle();
    worker()?.reply({ kind: "progress", done: 1, total: 3 });
    worker()?.reply({
      kind: "done",
      bytes: new Uint8Array(2_048),
      width: 10,
      height: 8,
      seconds: 12,
    });

    expect(states.slice(0, 4)).toEqual([
      { kind: "reading", seconds: 0, poses: 1104, chunks: null },
      { kind: "reading", seconds: 0, poses: 1104, chunks: { done: 0, total: 2 } },
      { kind: "reading", seconds: 0, poses: 1104, chunks: { done: 1, total: 2 } },
      { kind: "reading", seconds: 0, poses: 1104, chunks: { done: 2, total: 2 } },
    ]);
    expect(states[4]).toEqual({ kind: "drawing", seconds: 0, done: 1, total: 3 });
    expect(states[5]).toEqual({
      kind: "ready",
      url: expect.stringMatching(/^blob:/),
      fileName: "liveplace-kalyss-2026-11-11.gif",
      summary: "12 s · 10×8 · 2 Ko",
    });
    expect(states).toHaveLength(6);
    expect(worker()?.posted).toEqual([{ wire: WIRE, empty: [228, 226, 231] }]);
    expect(worker()?.isTerminated).toBe(true);
  });

  // Quand le flux de Redis commence à la version 1, alors aucune étape de chunks : le flux mène droit au dessin.
  it("goes from the stream straight to the drawing when there is no chunk step", async () => {
    const { states, push, worker } = setup();

    push(STREAM, DONE);
    await settle();
    worker()?.reply({ kind: "progress", done: 1, total: 3 });

    expect(states.map(({ kind }) => kind)).toEqual(["reading", "drawing"]);
  });

  // Tant que la fenêtre est ouverte, alors les secondes avancent toutes les secondes, à la lecture comme au dessin.
  it("counts the seconds every second while reading and drawing, and stops at the end", async () => {
    const { states, push, worker, last } = setup();

    push(STREAM);
    await settle();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(last()).toEqual({ kind: "reading", seconds: 1, poses: 1104, chunks: null });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(last()).toEqual({ kind: "reading", seconds: 12, poses: 1104, chunks: null });

    push(DONE);
    await settle();
    worker()?.reply({ kind: "progress", done: 4, total: 9 });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(last()).toEqual({ kind: "drawing", seconds: 15, done: 4, total: 9 });

    worker()?.reply({ kind: "done", bytes: new Uint8Array(10), width: 2, height: 2, seconds: 1 });
    const count = states.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states).toHaveLength(count);
  });

  // Quand la fenêtre se ferme pendant le dessin (la fonction d'arrêt), alors le Worker est arrêté et les secondes cessent.
  it("ends the Worker and stops the seconds when stopped while drawing", async () => {
    const { states, stop, push, worker } = setup();

    push(STREAM, DONE);
    await settle();
    const count = states.length;
    stop();

    expect(worker()?.isTerminated).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    worker()?.reply({ kind: "progress", done: 1, total: 3 });
    expect(states).toHaveLength(count);
  });

  // Si la fenêtre se ferme pendant la lecture, alors la requête est annulée et la page n'affiche rien de plus, pas même une erreur.
  it("shows nothing more when stopped during the reading, not even a cut", async () => {
    const { states, stop, push, sent } = setup();

    push(STREAM);
    await settle();
    const count = states.length;
    stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sent[0]?.init?.signal?.aborted).toBe(true);
    expect(states).toHaveLength(count);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  // Chaque erreur du serveur a son message : un fichier sans réponse, aucun dessin, un historique trop long, le reste.
  it.each([
    ["history_timeout", "historyTimeout"],
    ["no_changes", "noChanges"],
    ["too_many_changes", "tooManyChanges"],
    ["canvas_not_found", "failed"],
    ["forbidden", "failed"],
    ["failed", "failed"],
  ])("shows the failure of a %s line as %s", async (error, reason) => {
    const { push, last } = setup();

    push(STREAM, FAILED(error));
    await settle();

    expect(last()).toEqual({ kind: "failed", reason });
  });

  // Si le flux se ferme avant `done`, alors « La connexion au serveur a été coupée. ».
  it("shows a lost connection when the stream closes before done", async () => {
    const { push, close, last } = setup();

    push(STREAM, CHUNKS(0));
    close();
    await settle();

    expect(last()).toEqual({ kind: "failed", reason: "disconnected" });
  });

  // Si aucun octet n'arrive pendant 60 s, alors « Le serveur ne répond plus depuis 60 s. » et la requête est annulée.
  it("shows the silence after 60 seconds without a byte, and cancels the request", async () => {
    const { push, sent, last } = setup();

    push(STREAM);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(last()).toEqual({ kind: "failed", reason: "silent" });
    expect(sent[0]?.init?.signal?.aborted).toBe(true);
  });

  // Si le Worker échoue, alors le message correspondant : aucun dessin, ou l'échec général.
  it("shows the failure of the Worker", async () => {
    const { push, worker, last } = setup();

    push(STREAM, DONE);
    await settle();
    worker()?.reply({ kind: "failed", reason: "no_changes" });

    expect(last()).toEqual({ kind: "failed", reason: "noChanges" });
  });
});
