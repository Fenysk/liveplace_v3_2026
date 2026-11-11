// Ce que la page et le Web Worker du GIF s'envoient (JOURNAL 2026-11-11).

import type { TimelapseWire } from "../../usecase/export-timelapse";
import type { Rgb } from "./gif-writer";

// `empty` : la couleur de la case vide du jeu, lue dans la page : un Worker n'a pas de feuille de style.
export type WorkerRequest = { wire: TimelapseWire; empty: Rgb };

export type WorkerReply =
  | { kind: "progress"; done: number; total: number }
  | { kind: "done"; bytes: Uint8Array<ArrayBuffer>; width: number; height: number; seconds: number }
  | { kind: "failed"; reason: "no_changes" | "failed" };
