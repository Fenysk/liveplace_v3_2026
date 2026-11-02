import type { OrphanStore } from "@liveplace/domain/ports";
import { ORPHAN_GRACE_MS } from "@liveplace/domain/retention";
import { describe, expect, it } from "vitest";
import { createOrphanCycle } from "./orphan-cycle";

type Page = { next: number; deleted: number; isDone: boolean };

// Un Convex qui rend les pages qu'on lui donne, et note ce qu'on lui a demandé.
const setup = (pages: (Page | Error)[]) => {
  let clock = 1_000_000;
  const asked: { after: number; graceMs: number; maxFiles: number }[] = [];
  const logged: string[] = [];
  const store: OrphanStore = {
    purgeOrphans: async (after, graceMs, maxFiles) => {
      asked.push({ after, graceMs, maxFiles });
      const page = pages.shift() ?? { next: after, deleted: 0, isDone: true };
      if (page instanceof Error) throw page;
      return page;
    },
  };
  const cycle = createOrphanCycle({ store, now: () => clock, log: (message) => logged.push(message) });
  return {
    cycle,
    asked,
    logged,
    advance: (ms: number) => {
      clock += ms;
    },
    // Un tour qui dure : chaque appel à Convex prend 3 s.
    slowDown: () => {
      const purge = store.purgeOrphans;
      store.purgeOrphans = async (...args) => {
        clock += 3_000;
        return purge(...args);
      };
    },
  };
};

describe("the cycle of the files no row points to (CDC §8, JOURNAL 2026-11-02)", () => {
  // Un passage ne redemande que les fichiers arrivés depuis le précédent, avec la grâce d'une heure
  it("asks again from where the last pass stopped, with a grace of one hour", async () => {
    const { cycle, asked, advance } = setup([
      { next: 500, deleted: 2, isDone: true },
      { next: 900, deleted: 0, isDone: true },
    ]);

    await cycle.tick();
    advance(60 * 60_000);
    await cycle.tick();

    expect(asked).toEqual([
      { after: 0, graceMs: ORPHAN_GRACE_MS, maxFiles: 100 },
      { after: 500, graceMs: ORPHAN_GRACE_MS, maxFiles: 100 },
    ]);
    expect(ORPHAN_GRACE_MS).toBe(60 * 60_000);
  });

  // Un passage par heure : entre deux, Convex n'est pas appelé
  it("calls Convex once an hour, not between two passes", async () => {
    const { cycle, asked, advance } = setup([]);

    await cycle.tick();
    advance(59 * 60_000);
    await cycle.tick();
    advance(60_000);
    await cycle.tick();

    expect(asked).toHaveLength(2);
  });

  // Une page pleine appelle la suivante, et le total retiré se dit une fois
  it("follows full pages until the last, and says the total once", async () => {
    const { cycle, asked, logged } = setup([
      { next: 100, deleted: 3, isDone: false },
      { next: 200, deleted: 4, isDone: false },
      { next: 250, deleted: 0, isDone: true },
    ]);

    await cycle.tick();

    expect(asked.map(({ after }) => after)).toEqual([0, 100, 200]);
    expect(logged).toEqual(["7 fichier(s) sans ligne retiré(s) de Convex"]);
  });

  // Un tour rend la main avant la fin du bail : le passage s'étend sur plusieurs tours, depuis la borne
  it("spreads a long pass over several ticks, from the mark each time", async () => {
    const { cycle, asked, slowDown } = setup([
      { next: 100, deleted: 0, isDone: false },
      { next: 200, deleted: 0, isDone: false },
      { next: 300, deleted: 0, isDone: false },
      { next: 400, deleted: 0, isDone: true },
    ]);
    slowDown();

    await cycle.tick();
    expect(asked).toHaveLength(2);
    await cycle.tick();

    expect(asked.map(({ after }) => after)).toEqual([0, 100, 200, 300]);
  });

  // Une borne qui n'avance pas ne fait pas tourner le tour à vide
  it("does not loop on a mark that does not move", async () => {
    const { cycle, asked } = setup([
      { next: 0, deleted: 0, isDone: false },
      { next: 0, deleted: 0, isDone: false },
    ]);

    await cycle.tick();

    expect(asked).toHaveLength(1);
  });

  // Convex qui coupe : le passage reprend dans cinq minutes, de la même borne
  it("retries in five minutes from the same mark when Convex cuts", async () => {
    const { cycle, asked, logged, advance } = setup([
      new Error("Convex a coupé"),
      { next: 10, deleted: 1, isDone: true },
    ]);

    await cycle.tick();
    advance(4 * 60_000);
    await cycle.tick();
    advance(60_000);
    await cycle.tick();

    expect(asked.map(({ after }) => after)).toEqual([0, 0]);
    expect(logged[0]).toContain("interrompu");
    expect(logged[1]).toBe("1 fichier(s) sans ligne retiré(s) de Convex");
  });
});
