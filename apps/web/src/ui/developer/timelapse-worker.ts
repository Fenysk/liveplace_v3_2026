// Le Web Worker du GIF timelapse (JOURNAL 2026-11-11) : décode, dessine et encode hors du fil de la page, et lui rend la progression.

import { decodeTimelapse } from "./timelapse-frames";
import { buildTimelapseGif } from "./timelapse-gif";
import type { WorkerReply, WorkerRequest } from "./timelapse-messages";

const reply = (message: WorkerReply, transfer: Transferable[] = []): void =>
  self.postMessage(message, { transfer });

self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const gif = buildTimelapseGif(decodeTimelapse(data.wire), data.empty, (done, total) =>
      reply({ kind: "progress", done, total }),
    );
    if (!gif.ok) return reply({ kind: "failed", reason: gif.error });
    const { bytes, width, height, seconds } = gif.value;
    reply({ kind: "done", bytes, width, height, seconds }, [bytes.buffer]);
  } catch (error) {
    console.error("timelapse : le GIF n'a pas été produit", error);
    reply({ kind: "failed", reason: "failed" });
  }
};
