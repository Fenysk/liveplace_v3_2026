import type { ExpiryPage, ExpiryStore } from "@liveplace/domain/ports";
import { deletionProofCutoff, unlinkedDonationCutoff } from "@liveplace/domain/retention";
import { describe, expect, it } from "vitest";
import { createExpiryCycle } from "./expiry-cycle";

const START = Date.UTC(2026, 10, 4, 21, 0, 0);
const HOUR = 60 * 60_000;
const NOTHING: ExpiryPage = { purged: 0, isDone: true };

// Un Convex qui rend les pages qu'on lui donne, et note ce qu'on lui a demandé.
const setup = (pages: { donations?: (ExpiryPage | Error)[]; proofs?: (ExpiryPage | Error)[] } = {}) => {
  let clock = START;
  const asked: { kind: "donations" | "proofs"; before: number }[] = [];
  const logged: string[] = [];
  const answer = (kind: "donations" | "proofs", before: number): ExpiryPage => {
    asked.push({ kind, before });
    const page = pages[kind]?.shift() ?? NOTHING;
    if (page instanceof Error) throw page;
    return page;
  };
  const store: ExpiryStore = {
    purgeUnlinkedDonations: async (before) => answer("donations", before),
    purgeDeletionProofs: async (before) => answer("proofs", before),
  };
  const cycle = createExpiryCycle({ store, now: () => clock, log: (message) => logged.push(message) });
  return {
    cycle,
    asked,
    logged,
    advance: (ms: number) => {
      clock += ms;
    },
    // Un tour qui dure : chaque appel à Convex prend 3 s.
    slowDown: () => {
      for (const method of ["purgeUnlinkedDonations", "purgeDeletionProofs"] as const) {
        const purge = store[method];
        store[method] = async (before) => {
          clock += 3_000;
          return purge(before);
        };
      }
    },
  };
};

describe("le cycle des lignes expirées (JOURNAL 2026-11-04)", () => {
  // Un don part 12 mois après sa date, une preuve 5 ans après : les limites sont comptées à l'instant de l'appel
  it("asks for the donations older than 12 months and the proofs older than 5 years", async () => {
    const { cycle, asked } = setup();

    await cycle.tick();

    expect(asked).toEqual([
      { kind: "donations", before: unlinkedDonationCutoff(START) },
      { kind: "proofs", before: deletionProofCutoff(START) },
    ]);
    expect(unlinkedDonationCutoff(START)).toBe(Date.UTC(2025, 10, 4, 21, 0, 0));
    expect(deletionProofCutoff(START)).toBe(Date.UTC(2021, 10, 4, 21, 0, 0));
  });

  // Un passage par heure : entre deux, Convex n'est pas appelé
  it("calls Convex once an hour, not between two passes", async () => {
    const { cycle, asked, advance } = setup();

    await cycle.tick();
    advance(HOUR - 1);
    await cycle.tick();
    expect(asked).toHaveLength(2);

    advance(1);
    await cycle.tick();
    expect(asked).toHaveLength(4);
    expect(asked[2]?.before).toBe(unlinkedDonationCutoff(START + HOUR));
  });

  // Un lot plein veut dire qu'il en reste : le cycle rappelle jusqu'à la dernière page
  it("calls again while a batch is full, then goes on to the proofs", async () => {
    const { cycle, asked, logged } = setup({
      donations: [
        { purged: 100, isDone: false },
        { purged: 100, isDone: false },
        { purged: 7, isDone: true },
      ],
      proofs: [{ purged: 2, isDone: true }],
    });

    await cycle.tick();

    expect(asked.map(({ kind }) => kind)).toEqual(["donations", "donations", "donations", "proofs"]);
    expect(logged).toEqual(["207 don(s) non relié(s) et 2 preuve(s) d'effacement expirés effacés de Convex"]);
  });

  // Rien n'a expiré : rien à dire dans les journaux
  it("says nothing when nothing expired", async () => {
    const { cycle, logged } = setup();

    await cycle.tick();

    expect(logged).toEqual([]);
  });

  // Un tour ne bloque pas le bail : au bout de 5 s le passage s'arrête, et le tour suivant le reprend sans attendre l'heure
  it("hands the turn back after 5 seconds and resumes at the next turn", async () => {
    const { cycle, asked, advance, slowDown } = setup({
      donations: [
        { purged: 100, isDone: false },
        { purged: 100, isDone: false },
        { purged: 100, isDone: false },
        { purged: 5, isDone: true },
      ],
    });
    slowDown();

    await cycle.tick();
    expect(asked.map(({ kind }) => kind)).toEqual(["donations", "donations"]);

    advance(250);
    await cycle.tick();
    expect(asked.map(({ kind }) => kind)).toEqual([
      "donations",
      "donations",
      "donations",
      "donations",
      "proofs",
    ]);
  });

  // Convex en panne : le passage reprend dans 5 minutes, pas dans l'heure, et dit pourquoi
  it("retries in 5 minutes after a failure", async () => {
    const { cycle, asked, logged, advance } = setup({ donations: [new Error("Convex injoignable")] });

    await cycle.tick();
    expect(logged).toEqual(["effacement des lignes expirées interrompu, il reprend dans 5 min"]);

    advance(4 * 60_000);
    await cycle.tick();
    expect(asked).toHaveLength(1);

    advance(60_000);
    await cycle.tick();
    expect(asked.map(({ kind }) => kind)).toEqual(["donations", "donations", "proofs"]);
  });
});
