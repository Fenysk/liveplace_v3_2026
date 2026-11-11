// Les lignes de `POST /dev/timelapse` (JOURNAL 2026-11-11) : une ligne JSON par événement, le même contrat pour le serveur qui
// les écrit et pour la page qui les lit. Rien d'autre que des types et du texte : le navigateur l'importe aussi.

import { z } from "zod";
import type { TimelapseProgress, TimelapseWire } from "../../usecase/export-timelapse";

// `failed.error` : le refus du usecase (`history_timeout`, `no_changes`…), ou `failed` pour une panne imprévue.
export type TimelapseLine =
  | ({ kind: "progress" } & TimelapseProgress)
  | { kind: "done"; value: TimelapseWire }
  | { kind: "failed"; error: string };

export type TimelapseProgressLine = Extract<TimelapseLine, { kind: "progress" }>;

const LineSchema: z.ZodType<TimelapseLine> = z.union([
  z.object({ kind: z.literal("progress"), step: z.literal("stream"), poses: z.number() }),
  z.object({ kind: z.literal("progress"), step: z.literal("chunks"), done: z.number(), total: z.number() }),
  z.object({
    kind: z.literal("done"),
    value: z.object({ width: z.number(), height: z.number(), initial: z.string(), changes: z.string() }),
  }),
  z.object({ kind: z.literal("failed"), error: z.string() }),
]);

export const encodeLine = (line: TimelapseLine): string => `${JSON.stringify(line)}\n`;

// `null` : la ligne n'est pas du contrat, et le journal du navigateur dit laquelle.
export function parseLine(text: string): TimelapseLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    console.error("timelapse : ligne illisible", text.slice(0, 200), error);
    return null;
  }
  const line = LineSchema.safeParse(value);
  if (line.success) return line.data;
  console.error("timelapse : ligne hors contrat", text.slice(0, 200));
  return null;
}
