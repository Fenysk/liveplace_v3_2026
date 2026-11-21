import { CHARITY_READ_EVERY_MS, type CharityDonation } from "@liveplace/domain/charity-event";
import type { CharityDonationSource, CharityDonationStore, CharityRead } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { createCharityCycle } from "./charity-cycle";

const T0 = Date.UTC(2026, 10, 20, 12);
const SECOND_MS = 1000;

const read = (canvasId: string): CharityRead => ({
  canvasId,
  source: { kind: "user", user: "grenneh_", campaign: canvasId },
  startsAt: T0 - 3_600_000,
  endsAt: T0 + 3_600_000,
});

const donation = (id: string, cents = 100): CharityDonation => ({
  id,
  name: "Julie",
  cents,
  currency: "EUR",
  donatedAt: T0,
});

// Un Redis et un Streamlabs Charity en mémoire : les fresques à lire, les verrous, ce qui est rangé, ce que l'API répond.
function createFakes(reads: CharityRead[]) {
  const clock = { at: T0 };
  const locks = new Map<string, string>();
  const stored: Array<{ canvasId: string; ids: string[]; at: number }> = [];
  const listed: string[] = [];
  const logs: string[] = [];
  const waits: number[] = [];
  const state = {
    reads,
    failListing: false,
    failures: new Map<string, number>(), // les lectures qui vont échouer, par fresque
    donations: new Map<string, CharityDonation[]>(),
    gate: null as Promise<void> | null, // une lecture lente : elle attend ce signal
    otherHolder: new Set<string>(), // les fresques dont un autre lecteur tient déjà le verrou
  };

  const store: CharityDonationStore = {
    async listCharityReads() {
      if (state.failListing) throw new Error("Redis injoignable");
      return state.reads;
    },
    async storeCharityDonations(canvasId, donations, at) {
      stored.push({ canvasId, ids: donations.map(({ id }) => id), at });
      return donations.length;
    },
    async lockCharityRead(canvasId, holder) {
      if (state.otherHolder.has(canvasId) || locks.has(canvasId)) return false;
      locks.set(canvasId, holder);
      return true;
    },
    async unlockCharityRead(canvasId, holder) {
      if (locks.get(canvasId) === holder) locks.delete(canvasId);
    },
  };

  const source: CharityDonationSource = {
    async listDonations({ kind, ...page }) {
      const canvasId = "campaign" in page ? page.campaign : "?";
      listed.push(kind === "user" ? canvasId : "team");
      if (state.gate) await state.gate;
      const left = state.failures.get(canvasId) ?? 0;
      if (left > 0) {
        state.failures.set(canvasId, left - 1);
        throw new Error("Streamlabs Charity a répondu 503");
      }
      return state.donations.get(canvasId) ?? [];
    },
  };

  const cycle = createCharityCycle({
    store,
    source,
    holder: "worker-a",
    now: () => clock.at,
    wait: async (ms) => {
      waits.push(ms);
    },
    log: (message) => logs.push(message),
  });

  return { cycle, clock, locks, stored, listed, logs, waits, state };
}

const every = CHARITY_READ_EVERY_MS;

describe("the donation reader (CDC 2026 §8, Mode événement)", () => {
  // Une lecture par passage de 20 s, jamais entre deux
  it("reads every 20 seconds, never in between", async () => {
    const fakes = createFakes([read("a")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();
    fakes.clock.at += 10 * SECOND_MS;
    await fakes.cycle.tick();
    await fakes.cycle.settle();
    fakes.clock.at += 10 * SECOND_MS;
    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.listed).toEqual(["a", "a"]);
  });

  // Les dons lus sont rangés avec l'heure de la lecture
  it("stores the donations it reads, with the time of the reading", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.donations.set("a", [donation("1"), donation("2")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.stored).toEqual([{ canvasId: "a", ids: ["1", "2"], at: T0 }]);
  });

  // Sans fin, l'événement se lit comme un autre : la fin est facultative
  it("reads and stores an event that has no end", async () => {
    const { endsAt: _end, ...withoutEnd } = read("a");
    const fakes = createFakes([withoutEnd]);
    fakes.state.donations.set("a", [donation("1")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.stored).toEqual([{ canvasId: "a", ids: ["1"], at: T0 }]);
  });

  // Aucune fresque à lire : l'API n'est jamais appelée
  it("calls nothing when no canvas has an event to read", async () => {
    const fakes = createFakes([]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.listed).toEqual([]);
  });

  // Chaque fresque est lue pour elle-même, la panne de l'une ne retient pas l'autre
  it("reads each canvas on its own: one canvas's outage does not hold the other back", async () => {
    const fakes = createFakes([read("a"), read("b")]);
    fakes.state.failures.set("a", 99);
    fakes.state.donations.set("b", [donation("7")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.stored).toEqual([{ canvasId: "b", ids: ["7"], at: T0 }]);
  });

  // Un autre lecteur tient déjà l'événement : celui-ci ne lit pas
  it("does not read an event another reader already holds", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.otherHolder.add("a");

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.listed).toEqual([]);
    expect(fakes.stored).toEqual([]);
  });

  // Le verrou est rendu après la lecture, réussie ou non
  it("gives the lock back after a reading, successful or not", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.failures.set("a", 99);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.locks.size).toBe(0);
  });

  // Une lecture qui dure ne se double pas, et le tour ne l'attend pas
  it("does not start a second reading while one is running, and the tick does not wait for it", async () => {
    const fakes = createFakes([read("a")]);
    let release = (): void => undefined;
    fakes.state.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await fakes.cycle.tick();
    fakes.clock.at += every;
    await fakes.cycle.tick();
    release();
    await fakes.cycle.settle();

    expect(fakes.listed).toEqual(["a"]);
  });
});

describe("the outages of the donation page", () => {
  // Un échec, puis un second essai quelques secondes plus tard dans le même passage
  it("tries again a few seconds later in the same pass, and stores what the second try reads", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.failures.set("a", 1);
    fakes.state.donations.set("a", [donation("1")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.listed).toEqual(["a", "a"]);
    expect(fakes.waits).toEqual([5_000]);
    expect(fakes.stored).toEqual([{ canvasId: "a", ids: ["1"], at: T0 }]);
    expect(fakes.logs).toEqual([]);
  });

  // Deux échecs d'affilée : rien n'est rangé, un message, et le passage suivant relit
  it("stores nothing after two failures, says so once, then reads again at the next pass and says it is back", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.failures.set("a", 4);
    fakes.state.donations.set("a", [donation("1")]);

    await fakes.cycle.tick();
    await fakes.cycle.settle();
    fakes.clock.at += every;
    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.stored).toEqual([]);
    expect(fakes.logs).toHaveLength(1);

    fakes.clock.at += every;
    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.stored).toEqual([{ canvasId: "a", ids: ["1"], at: T0 + 2 * every }]);
    expect(fakes.logs).toHaveLength(2);
    expect(fakes.logs[1]).toContain("de nouveau lus");
  });

  // Une panne de Redis au moment de lister les fresques ne coupe pas le worker
  it("survives a Redis outage while listing the canvases, and lists again at the next pass", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.failListing = true;
    await fakes.cycle.tick();

    fakes.state.failListing = false;
    fakes.clock.at += every;
    await fakes.cycle.tick();
    await fakes.cycle.settle();

    expect(fakes.logs).toHaveLength(1);
    expect(fakes.listed).toEqual(["a"]);
  });

  // Un message tous les 15 passages seulement quand la panne dure
  it("repeats a lasting outage only every 15 passes, not at every pass", async () => {
    const fakes = createFakes([read("a")]);
    fakes.state.failures.set("a", 999);

    for (let pass = 0; pass < 16; pass += 1) {
      await fakes.cycle.tick();
      await fakes.cycle.settle();
      fakes.clock.at += every;
    }

    expect(fakes.logs).toHaveLength(2);
  });
});
