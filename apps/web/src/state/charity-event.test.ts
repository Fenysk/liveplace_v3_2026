import type { CharityEventState } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import {
  CHARITY_TIMER_MAX_MS,
  charityRecheckDelayMs,
  charityStatusOf,
  claimChoiceOf,
  dropShownDonation,
  enqueueDonation,
  type QueuedDonation,
} from "./charity-event";

const state = (overrides: Partial<CharityEventState> = {}): CharityEventState => ({
  isEnabled: true,
  title: "Live caritatif",
  address: "https://streamlabscharity.com/@a/b",
  startsAt: 10_000,
  endsAt: 20_000,
  donationCount: 0,
  ...overrides,
});

describe("charityStatusOf", () => {
  it("suit l'horloge : à venir, en cours, puis terminé quand la fin est passée", () => {
    expect(charityStatusOf(state(), 9_999)).toEqual({ kind: "upcoming", startsAt: 10_000 });
    expect(charityStatusOf(state(), 10_000)).toEqual({ kind: "running" });
    expect(charityStatusOf(state(), 19_999)).toEqual({ kind: "running" });
    expect(charityStatusOf(state(), 20_000)).toEqual({ kind: "ended" });
  });

  it("est désactivé sans réglage reçu ou avec le switch coupé, quelle que soit l'horloge", () => {
    expect(charityStatusOf(undefined, 15_000)).toEqual({ kind: "off" });
    expect(charityStatusOf(state({ isEnabled: false }), 15_000)).toEqual({ kind: "off" });
  });

  it("est en cours sans fin dès le début, et ne finit jamais", () => {
    expect(charityStatusOf(state({ endsAt: undefined }), 9_999)).toEqual({
      kind: "upcoming",
      startsAt: 10_000,
    });
    expect(charityStatusOf(state({ endsAt: undefined }), 10_000)).toEqual({ kind: "running" });
    expect(charityStatusOf(state({ endsAt: undefined }), 9e15)).toEqual({ kind: "running" });
  });

  it("dit pourquoi il est inactif", () => {
    expect(charityStatusOf(state({ title: "" }), 15_000)).toEqual({ kind: "inactive", reason: "title" });
    expect(charityStatusOf(state({ address: "https://example.com/x" }), 15_000)).toEqual({
      kind: "inactive",
      reason: "address",
    });
  });
});

describe("charityRecheckDelayMs", () => {
  it("rafraîchit le compte à rebours à chaque changement de son affichage, puis attend la fin", () => {
    expect(charityRecheckDelayMs(state({ startsAt: 5_000 }), 4_500)).toBe(500);
    expect(charityRecheckDelayMs(state(), 5_000)).toBe(1);
    expect(charityRecheckDelayMs(state({ startsAt: 3_600_000 + 10_000, endsAt: 4_000_000 }), 10_000)).toBe(1);
    expect(charityRecheckDelayMs(state(), 15_000)).toBe(1);
  });

  // Dans la dernière heure avant la fin, les secondes descendent une à une ; avant elle, le prochain réveil est l'entrée dans l'heure
  it("ticks each second in the last hour before the end, and wakes up when that hour starts before it", () => {
    expect(charityRecheckDelayMs(state(), 15_400)).toBe(601);
    expect(charityRecheckDelayMs(state({ endsAt: 3_620_000 }), 15_000)).toBe(5_001);
    expect(charityRecheckDelayMs(state({ endsAt: 3_620_000 }), 20_000)).toBe(1);
    expect(charityRecheckDelayMs(state({ endsAt: 3_620_000 }), 20_001)).toBe(1_000);
  });

  // Une fin absente : en cours, il n'y a rien à attendre ; avant le début, le compte à rebours tourne quand même
  it("waits for nothing while running without an end, and still counts down to the start", () => {
    expect(charityRecheckDelayMs(state({ endsAt: undefined }), 15_000)).toBeNull();
    expect(charityRecheckDelayMs(state({ endsAt: undefined, startsAt: 5_000 }), 4_500)).toBe(500);
  });

  it("ne programme rien sans événement en attente ni en cours", () => {
    expect(charityRecheckDelayMs(undefined, 15_000)).toBeNull();
    expect(charityRecheckDelayMs(state({ isEnabled: false }), 15_000)).toBeNull();
    expect(charityRecheckDelayMs(state(), 25_000)).toBeNull(); // terminé : plus rien à attendre
  });

  it("borne le délai à ce que sait attendre un minuteur", () => {
    expect(charityRecheckDelayMs(state({ startsAt: 9e12, endsAt: 9e12 + 1 }), 0)).toBeLessThanOrEqual(
      CHARITY_TIMER_MAX_MS,
    );
    expect(charityRecheckDelayMs(state({ endsAt: 9e12 }), 15_000)).toBe(CHARITY_TIMER_MAX_MS);
  });
});

describe("la file des toasts", () => {
  const donation = (id: number): QueuedDonation => ({
    id,
    donor: `d${id}`,
    cents: 100,
    currency: "EUR",
    pixels: 100,
  });

  it("montre les dons arrivés ensemble l'un après l'autre, dans l'ordre", () => {
    let queue = enqueueDonation(enqueueDonation([], donation(1)), donation(2));
    expect(queue[0]?.id).toBe(1);
    queue = dropShownDonation(queue);
    expect(queue[0]?.id).toBe(2);
    expect(dropShownDonation(queue)).toEqual([]);
  });

  it("reste vide quand rien n'est montré", () => {
    expect(dropShownDonation([])).toEqual([]);
  });
});

describe("claimChoiceOf", () => {
  it("passe le bonus avant le +1 de la jauge", () => {
    expect(claimChoiceOf(1_200, 1)).toBe("bonus");
    expect(claimChoiceOf(1_200, 0)).toBe("bonus");
  });

  it("réclame le +1 sans bonus, et rien sans l'un ni l'autre", () => {
    expect(claimChoiceOf(0, 2)).toBe("gauge");
    expect(claimChoiceOf(0, 0)).toBeNull();
  });
});
