import type { ReportedPlacement } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { pendingReportKey, toPendingReports } from "./pending-reports";

const now = 1_700_000_000_000;
const MINUTE = 60_000;

const pose = (
  userId: string,
  placementId: string,
  overrides: Partial<ReportedPlacement> = {},
): ReportedPlacement => ({
  userId,
  login: userId,
  displayName: userId,
  hasAccount: true,
  placementId,
  reportCount: 1,
  reportedAt: now,
  isOffStream: false,
  pixels: [{ x: 0, y: 0, colorIndex: 4 }],
  ...overrides,
});

describe("one row per report (JOURNAL 2026-10-07)", () => {
  // Les poses d'un auteur signalées à la même heure font une seule ligne, la première pose d'abord
  it("gives one row to an author's placements reported at the same time, the first placement first", () => {
    const rows = toPendingReports([pose("troll", "pone00001"), pose("troll", "ptwo00001")]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "troll",
      displayName: "troll",
      placementId: "pone00001",
      placementIds: ["pone00001", "ptwo00001"],
      reportedAt: now,
    });
  });

  // Une pose seule garde sa ligne, avec elle seule dans ses poses
  it("keeps a lone placement as its own row, listed alone", () => {
    const lone = pose("troll", "pone00001", { reportCount: 2, isOffStream: true });

    expect(toPendingReports([lone])).toEqual([{ ...lone, placementIds: ["pone00001"] }]);
  });

  // Deux heures de signalement font deux lignes : la plage et la pose signalée seule avant
  it("gives two rows to two reporting times", () => {
    const rows = toPendingReports([
      pose("troll", "pone00001", { reportedAt: now - MINUTE }),
      pose("troll", "ptwo00001"),
    ]);

    expect(rows.map(({ placementIds }) => placementIds)).toEqual([["pone00001"], ["ptwo00001"]]);
  });

  // Deux auteurs signalés à la même heure font deux lignes
  it("gives two rows to two authors reported at the same time", () => {
    const rows = toPendingReports([pose("troll", "pone00001"), pose("other", "pone00001")]);

    expect(rows.map(({ userId }) => userId)).toEqual(["troll", "other"]);
  });

  // La ligne montre l'union des pixels de ses poses
  it("shows the union of its placements' pixels", () => {
    const rows = toPendingReports([
      pose("troll", "pone00001", { pixels: [{ x: 0, y: 0, colorIndex: 4 }] }),
      pose("troll", "ptwo00001", {
        pixels: [
          { x: 1, y: 0, colorIndex: 5 },
          { x: 2, y: 0, colorIndex: 6 },
        ],
      }),
    ]);

    expect(rows[0]?.pixels).toEqual([
      { x: 0, y: 0, colorIndex: 4 },
      { x: 1, y: 0, colorIndex: 5 },
      { x: 2, y: 0, colorIndex: 6 },
    ]);
  });

  // Le nombre de signalements est le plus grand de ses poses
  it("counts the highest number of reports among its placements", () => {
    const rows = toPendingReports([
      pose("troll", "pone00001", { reportCount: 1 }),
      pose("troll", "ptwo00001", { reportCount: 3 }),
      pose("troll", "pthree001", { reportCount: 2 }),
    ]);

    expect(rows[0]?.reportCount).toBe(3);
  });

  // Une pose cachée du stream suffit à cacher la ligne
  it("is off the stream as soon as one placement is", () => {
    const rows = toPendingReports([
      pose("troll", "pone00001", { isOffStream: false }),
      pose("troll", "ptwo00001", { isOffStream: true }),
      pose("troll", "pthree001", { isOffStream: false }),
    ]);

    expect(rows[0]?.isOffStream).toBe(true);
  });

  // L'ordre de première apparition est gardé, même quand les poses d'un signalement ne se suivent pas
  it("keeps the order of first appearance, even when a report's placements are not next to each other", () => {
    const rows = toPendingReports([
      pose("troll", "pone00001", { reportedAt: now }),
      pose("other", "pone00001", { reportedAt: now }),
      pose("troll", "pthree001", { reportedAt: now + MINUTE }),
      pose("troll", "ptwo00001", { reportedAt: now }),
    ]);

    expect(rows.map(({ userId, placementIds }) => [userId, placementIds])).toEqual([
      ["troll", ["pone00001", "ptwo00001"]],
      ["other", ["pone00001"]],
      ["troll", ["pthree001"]],
    ]);
  });

  // La clé d'une ligne est son auteur et l'heure de son signalement
  it("keys a row by its author and its reporting time", () => {
    expect(pendingReportKey(pose("troll", "pone00001"))).toBe(`troll:${now}`);
  });
});
