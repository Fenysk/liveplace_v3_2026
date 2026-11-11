import { describe, expect, it } from "vitest";
import {
  canRetry,
  failureOf,
  formatBytes,
  TIMELAPSE_SILENCE_MS,
  TIMELAPSE_TEXTS,
  timelapseFileName,
  timelapseSummary,
} from "./timelapse-summary";

describe("les mesures du GIF timelapse (JOURNAL 2026-11-11)", () => {
  // Quand le GIF fait 2,4 Mo, alors la ligne dit la durée, la taille en pixels et le poids, séparés par des points médians.
  it("sums up the duration, the size in pixels and the weight of the file", () => {
    expect(timelapseSummary({ seconds: 32, width: 630, height: 504, bytes: 2_516_582 })).toBe(
      "32 s · 630×504 · 2,4 Mo",
    );
  });

  // Quand le GIF pèse moins d'un mégaoctet, alors le poids se dit en kilo-octets, au moins 1 Ko.
  it("counts below a megabyte in kilobytes, one at the least", () => {
    expect(formatBytes(655_360)).toBe("640 Ko");
    expect(formatBytes(10)).toBe("1 Ko");
  });

  // Quand on télécharge le GIF, alors son nom est le pseudo et le jour de Paris, comme celui du PNG d'une archive.
  it("names the file after the login and the day in Paris", () => {
    expect(timelapseFileName("kalyss", Date.UTC(2026, 10, 11, 23, 30))).toBe(
      "liveplace-kalyss-2026-11-12.gif",
    );
  });

  // Quand le serveur refuse, alors seuls « aucun dessin » et « historique trop long » ont leur message ; le reste est un échec.
  it("keeps one message for every refusal that is not a case of its own", () => {
    expect(failureOf("no_changes")).toBe("noChanges");
    expect(failureOf("too_many_changes")).toBe("tooManyChanges");
    for (const error of ["unauthenticated", "forbidden", "canvas_not_found", "failed"])
      expect(failureOf(error)).toBe("failed");
    expect(TIMELAPSE_TEXTS.failures.noChanges).toBe("Cette fresque n'a encore aucun dessin à animer.");
    expect(TIMELAPSE_TEXTS.failures.tooManyChanges).toBe("Historique trop long pour un GIF.");
    expect(TIMELAPSE_TEXTS.failures.failed).toBe("Le GIF n'a pas pu être créé.");
  });

  // Quand un fichier de l'historique n'a pas répondu, alors `history_timeout` a son message, comme la connexion coupée et le silence.
  it("has a message of its own for a file that did not answer, a cut connection and a silent server", () => {
    expect(failureOf("history_timeout")).toBe("historyTimeout");
    expect(TIMELAPSE_TEXTS.failures.historyTimeout).toBe(
      "Un fichier de l'historique n'a pas répondu (2 essais de 20 s).",
    );
    expect(TIMELAPSE_TEXTS.failures.disconnected).toBe("La connexion au serveur a été coupée.");
    expect(TIMELAPSE_TEXTS.failures.silent).toBe("Le serveur ne répond plus depuis 60 s.");
    expect(TIMELAPSE_SILENCE_MS).toBe(60_000);
  });

  // Quand l'échec peut passer (réseau, fichier lent, panne), alors Réessayer ; quand recommencer n'y changerait rien, non.
  it("offers a retry only for a failure that may pass", () => {
    for (const reason of ["failed", "historyTimeout", "disconnected", "silent"] as const)
      expect(canRetry(reason)).toBe(true);
    expect(canRetry("noChanges")).toBe(false);
    expect(canRetry("tooManyChanges")).toBe(false);
  });

  // Quand la lecture avance, alors les lignes disent le flux, les chunks et les secondes, les nombres au format français.
  it("says the stream, the chunks and the seconds, with numbers in French format", () => {
    expect(TIMELAPSE_TEXTS.stream(1104)).toBe(`Flux Redis : ${(1104).toLocaleString("fr-FR")} poses`);
    expect(TIMELAPSE_TEXTS.stream(1)).toBe("Flux Redis : 1 pose");
    expect(TIMELAPSE_TEXTS.chunks(12, 140)).toBe("Chunks Convex : 12 sur 140");
    expect(TIMELAPSE_TEXTS.chunks(1200, 14_000)).toBe(
      `Chunks Convex : ${(1200).toLocaleString("fr-FR")} sur ${(14_000).toLocaleString("fr-FR")}`,
    );
    expect(TIMELAPSE_TEXTS.seconds(12)).toBe("12 s");
  });
});
