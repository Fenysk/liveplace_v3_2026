// Les textes et les mesures du GIF timelapse (JOURNAL 2026-11-11). Du français voulu, comme toute la fenêtre Développeur.

import { type Timestamp, toParisDay } from "@liveplace/domain";

export type TimelapseFailure = "noChanges" | "tooManyChanges" | "failed";

export const TIMELAPSE_TEXTS = {
  button: "Créer le GIF de la fresque",
  title: "GIF de la fresque",
  reading: "Lecture de l'historique…",
  preview: "Aperçu du GIF de la fresque",
  download: "Télécharger",
  retry: "Réessayer",
  drawing: (done: number, total: number): string => `Image ${done} sur ${total}`,
  failures: {
    noChanges: "Cette fresque n'a encore aucun dessin à animer.",
    tooManyChanges: "Historique trop long pour un GIF.",
    failed: "Le GIF n'a pas pu être créé.",
  },
} as const;

// Ce que le serveur refuse hors des deux cas lisibles (session, droits, fresque absente) : un seul message.
export function failureOf(error: string): TimelapseFailure {
  if (error === "no_changes") return "noChanges";
  if (error === "too_many_changes") return "tooManyChanges";
  return "failed";
}

export const timelapseFileName = (login: string, nowMs: Timestamp): string =>
  `liveplace-${login}-${toParisDay(nowMs)}.gif`;

const KIB = 1024;
const MIB = KIB * KIB;

// « 2,4 Mo » au-dessus d'un mégaoctet, « 640 Ko » en dessous.
export const formatBytes = (bytes: number): string =>
  bytes >= MIB
    ? `${(bytes / MIB).toFixed(1).replace(".", ",")} Mo`
    : `${Math.max(1, Math.round(bytes / KIB))} Ko`;

type Measures = { seconds: number; width: number; height: number; bytes: number };

// « 32 s · 630×504 · 2,4 Mo » : la durée de l'animation, la taille de l'image et le poids du fichier.
export const timelapseSummary = ({ seconds, width, height, bytes }: Measures): string =>
  `${seconds} s · ${width}×${height} · ${formatBytes(bytes)}`;
