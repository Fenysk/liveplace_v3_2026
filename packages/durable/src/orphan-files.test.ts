import { ORPHAN_GRACE_MS } from "@liveplace/domain/retention";
import { describe, expect, it } from "vitest";
import { planOrphanPurge } from "./orphan-files";

const NOW = 1_700_000_000_000;
const options = { nowMs: NOW, graceMs: ORPHAN_GRACE_MS, after: 0, pageSize: 100 };

describe("the files no row points to (CDC §8, JOURNAL 2026-11-02)", () => {
  // Un fichier ancien qu'aucune ligne ne désigne part ; un fichier ancien qu'une ligne désigne reste
  it("removes an old file no row points to, and keeps an old file a row points to", () => {
    const plan = planOrphanPurge(
      [
        { id: "orphan", createdAt: NOW - 3 * ORPHAN_GRACE_MS },
        { id: "used", createdAt: NOW - 2 * ORPHAN_GRACE_MS },
      ],
      new Set(["used"]),
      options,
    );

    expect(plan.orphanIds).toEqual(["orphan"]);
    expect(plan.next).toBe(NOW - 2 * ORPHAN_GRACE_MS);
  });

  // Un fichier en cours d'enregistrement n'est jamais retiré : il a moins d'une heure, il n'a pas encore de ligne
  it("never removes a file that is younger than the grace, even without a row", () => {
    const plan = planOrphanPurge(
      [
        { id: "old", createdAt: NOW - 2 * ORPHAN_GRACE_MS },
        { id: "being-recorded", createdAt: NOW - ORPHAN_GRACE_MS + 1 },
      ],
      new Set(),
      options,
    );

    expect(plan.orphanIds).toEqual(["old"]);
    expect(plan.isDone).toBe(true);
  });

  // La borne ne dépasse jamais un fichier trop jeune : le passage suivant le reverra
  it("keeps the mark behind the first file that is too young, so the next pass sees it again", () => {
    const plan = planOrphanPurge(
      [
        { id: "old", createdAt: NOW - 2 * ORPHAN_GRACE_MS },
        { id: "young", createdAt: NOW - 1000 },
      ],
      new Set(),
      options,
    );

    expect(plan.next).toBe(NOW - 2 * ORPHAN_GRACE_MS);
  });

  // Une page pleine laisse du travail ; une page qui ne l'est pas, non
  it("says there is more to see when the page is full, and done when it is not", () => {
    const files = Array.from({ length: 3 }, (_, index) => ({
      id: `file-${index}`,
      createdAt: NOW - 10 * ORPHAN_GRACE_MS + index,
    }));

    expect(
      planOrphanPurge(files, new Set(files.map(({ id }) => id)), { ...options, pageSize: 3 }).isDone,
    ).toBe(false);
    expect(
      planOrphanPurge(files, new Set(files.map(({ id }) => id)), { ...options, pageSize: 4 }).isDone,
    ).toBe(true);
  });

  // Sans fichier, la borne ne bouge pas
  it("leaves the mark where it is when there is no file", () => {
    expect(planOrphanPurge([], new Set(), { ...options, after: 42 })).toEqual({
      orphanIds: [],
      next: 42,
      isDone: true,
    });
  });
});
