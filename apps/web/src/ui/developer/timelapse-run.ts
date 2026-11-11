// Une génération du GIF timelapse (JOURNAL 2026-11-11), côté navigateur : le serveur rejoue l'historique et dit où il en est ligne par
// ligne, un Web Worker dessine et encode. Rendre la fonction d'arrêt annule la requête, arrête les secondes et libère le Worker et l'URL.

import { toRgba } from "../archive/png-export";
import type { Rgb } from "./gif-writer";
import type { TimelapseProgressLine } from "./timelapse-lines";
import type { WorkerReply, WorkerRequest } from "./timelapse-messages";
import { streamTimelapse, type TimelapseStreamEnd } from "./timelapse-stream";
import { failureOf, type TimelapseFailure, timelapseFileName, timelapseSummary } from "./timelapse-summary";

// `seconds` : le temps écoulé depuis l'ouverture de la fenêtre. `poses` : celles du flux de Redis (`null` : pas encore lu) ; `chunks` : ceux
// de Convex lus sur le total (`null` : le flux dit tout, ou le total n'est pas encore connu).
export type TimelapseState =
  | { kind: "reading"; seconds: number; poses: number | null; chunks: { done: number; total: number } | null }
  | { kind: "drawing"; seconds: number; done: number; total: number }
  | { kind: "ready"; url: string; fileName: string; summary: string }
  | { kind: "failed"; reason: TimelapseFailure };

// La case vide du jeu en apparence claire (le gris du damier), lue dans les jetons sur un élément qui porte cette apparence :
// le Worker n'a pas de feuille de style, et la page peut être en sombre.
const EMPTY_CELL_PROPERTY = "--checker-b";

const emptyCellColor = (): Rgb => {
  const probe = document.createElement("div");
  probe.dataset.appearance = "light";
  probe.hidden = true;
  document.body.append(probe);
  const value = getComputedStyle(probe).getPropertyValue(EMPTY_CELL_PROPERTY).trim();
  probe.remove();
  if (!value.startsWith("#")) throw new Error(`timelapse : ${EMPTY_CELL_PROPERTY} illisible`);
  const [red, green, blue] = toRgba(value);
  return [red, green, blue];
};

export const TIMELAPSE_START: TimelapseState = { kind: "reading", seconds: 0, poses: null, chunks: null };

// La fin d'une lecture qui n'a pas rendu le GIF : ce que la fenêtre en dit.
const failureOfEnd = (end: Exclude<TimelapseStreamEnd, { kind: "done" }>): TimelapseFailure => {
  if (end.kind === "failed") return failureOf(end.error);
  return end.kind === "silent" ? "silent" : "disconnected";
};

export function startTimelapse(
  canvasId: string,
  login: string,
  onState: (state: TimelapseState) => void,
  send: typeof fetch = fetch,
): () => void {
  const request = new AbortController();
  const startedAt = Date.now();
  let isStopped = false;
  let worker: Worker | undefined;
  let url: string | undefined;
  let state = TIMELAPSE_START;
  const elapsed = (): number => Math.floor((Date.now() - startedAt) / 1000);
  const show = (next: TimelapseState): void => {
    if (isStopped) return;
    state = next;
    if (next.kind === "ready" || next.kind === "failed") clearInterval(ticker);
    onState(next);
  };
  // Les secondes courent à la lecture et au dessin, que le serveur ou le Worker parle ou non : jamais un état figé.
  const ticker = setInterval(() => {
    if (state.kind === "reading" || state.kind === "drawing") show({ ...state, seconds: elapsed() });
  }, 1000);
  const fail = (reason: TimelapseFailure): void => show({ kind: "failed", reason });
  const onReply = ({ data }: MessageEvent<WorkerReply>): void => {
    if (isStopped) return;
    if (data.kind === "progress") {
      show({ kind: "drawing", seconds: elapsed(), done: data.done, total: data.total });
    } else if (data.kind === "failed") {
      fail(failureOf(data.reason));
    } else {
      url = URL.createObjectURL(new Blob([data.bytes], { type: "image/gif" }));
      worker?.terminate();
      show({
        kind: "ready",
        url,
        fileName: timelapseFileName(login, Date.now()),
        summary: timelapseSummary({ ...data, bytes: data.bytes.byteLength }),
      });
    }
  };
  const draw = (message: WorkerRequest): void => {
    worker = new Worker(new URL("./timelapse-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = onReply;
    worker.onerror = () => fail("failed");
    worker.postMessage(message);
  };
  const crash = (error: unknown): void => {
    console.error("timelapse : le GIF n'a pas été créé", error);
    fail("failed");
  };
  const onProgress = (progress: TimelapseProgressLine): void => {
    if (state.kind !== "reading") return;
    show(
      progress.step === "stream"
        ? { kind: "reading", seconds: elapsed(), poses: progress.poses, chunks: null }
        : {
            kind: "reading",
            seconds: elapsed(),
            poses: state.poses,
            chunks: { done: progress.done, total: progress.total },
          },
    );
  };
  streamTimelapse(canvasId, { send, signal: request.signal, onProgress }).then((end) => {
    if (isStopped) return;
    if (end.kind !== "done") {
      fail(failureOfEnd(end));
      return;
    }
    try {
      draw({ wire: end.value, empty: emptyCellColor() });
    } catch (error) {
      crash(error);
    }
  }, crash);
  return () => {
    isStopped = true;
    request.abort();
    clearInterval(ticker);
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
  };
}
