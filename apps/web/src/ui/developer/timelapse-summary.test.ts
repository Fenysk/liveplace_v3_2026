import { describe, expect, it } from "vitest";
import {
  failureOf,
  formatBytes,
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
});
