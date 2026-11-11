import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeLine, parseLine } from "./timelapse-lines";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("les lignes du flux du GIF timelapse (JOURNAL 2026-11-11)", () => {
  // Quand une ligne est écrite puis relue, alors on retrouve la même ligne, une par ligne de texte.
  it("writes one JSON line and reads the same line back", () => {
    const lines = [
      { kind: "progress", step: "stream", poses: 1104 },
      { kind: "progress", step: "chunks", done: 12, total: 140 },
      { kind: "done", value: { width: 10, height: 8, initial: "AAA=", changes: "BBB=" } },
      { kind: "failed", error: "history_timeout" },
    ] as const;

    for (const line of lines) {
      const text = encodeLine(line);
      expect(text.endsWith("\n")).toBe(true);
      expect(text.slice(0, -1)).not.toContain("\n");
      expect(parseLine(text.trim())).toEqual(line);
    }
  });

  // Si la ligne n'est pas du JSON ou n'est pas du contrat, alors elle est rendue `null` et le journal du navigateur la nomme.
  it("returns null for a line that is not the contract, and logs it", () => {
    expect(parseLine("<html>502 Bad Gateway</html>")).toBeNull();
    expect(parseLine('{"kind":"progress","step":"unknown"}')).toBeNull();
    expect(parseLine('{"kind":"done"}')).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(3);
  });
});
