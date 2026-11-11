// Une génération du GIF timelapse (JOURNAL 2026-11-11), côté navigateur : le serveur rejoue l'historique, un Web Worker dessine et
// encode, la page n'attend que la progression. Rendre la fonction d'arrêt libère le Worker et l'URL de l'aperçu.

import { exportTimelapseFn } from "../../routes/-timelapse";
import { toRgba } from "../archive/png-export";
import type { Rgb } from "./gif-writer";
import type { WorkerReply, WorkerRequest } from "./timelapse-messages";
import { failureOf, type TimelapseFailure, timelapseFileName, timelapseSummary } from "./timelapse-summary";

export type TimelapseState =
  | { kind: "reading" }
  | { kind: "drawing"; done: number; total: number }
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

export function startTimelapse(
  canvasId: string,
  login: string,
  onState: (state: TimelapseState) => void,
): () => void {
  let isStopped = false;
  let worker: Worker | undefined;
  let url: string | undefined;
  const fail = (reason: TimelapseFailure): void => {
    if (!isStopped) onState({ kind: "failed", reason });
  };
  const onReply = ({ data }: MessageEvent<WorkerReply>): void => {
    if (isStopped) return;
    if (data.kind === "progress") {
      onState({ kind: "drawing", done: data.done, total: data.total });
    } else if (data.kind === "failed") {
      fail(failureOf(data.reason));
    } else {
      url = URL.createObjectURL(new Blob([data.bytes], { type: "image/gif" }));
      worker?.terminate();
      onState({
        kind: "ready",
        url,
        fileName: timelapseFileName(login, Date.now()),
        summary: timelapseSummary({ ...data, bytes: data.bytes.byteLength }),
      });
    }
  };
  const draw = (request: WorkerRequest): void => {
    worker = new Worker(new URL("./timelapse-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = onReply;
    worker.onerror = () => fail("failed");
    worker.postMessage(request);
  };
  const crash = (error: unknown): void => {
    console.error("timelapse : le GIF n'a pas été créé", error);
    fail("failed");
  };
  exportTimelapseFn({ data: { canvasId } }).then((result) => {
    if (isStopped) return;
    if (!result.ok) {
      fail(failureOf(result.error));
      return;
    }
    try {
      draw({ wire: result.value, empty: emptyCellColor() });
    } catch (error) {
      crash(error);
    }
  }, crash);
  return () => {
    isStopped = true;
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
  };
}
