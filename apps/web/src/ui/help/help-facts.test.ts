import { describe, expect, it } from "vitest";
import type { GaugeProps } from "../design/gauge";
import type { DraftPillState } from "../draft/draft-pill";
import { toPillFacts } from "./help-facts";

const gauge = (charges: number): GaugeProps => ({ charges, max: 10, refill: null, label: "" });

const drafting = (isTouchTracing: boolean): Extract<DraftPillState, { kind: "draft" }> => ({
  kind: "draft",
  gauge: gauge(4),
  palette: [],
  colorIndex: 1,
  recentColorIndexes: [],
  isSending: false,
  draftSize: 0,
  canSubmit: false,
  canDiscard: false,
  isTouchScreen: true,
  isTouchTracing,
  isPicking: false,
});

describe("ce que la pill Dessin dit aux bulles d'aide (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // En Vue, elle dit sa jauge et le +1 qui attend
  it("tells the gauge and the reward waiting in View", () => {
    expect(toPillFacts({ kind: "view", gauge: gauge(0), canClaim: true })).toEqual({
      pill: "view",
      charges: 0,
      canClaim: true,
      isTouchTracing: false,
    });
  });

  // En Dessin, sa jauge et le Tracé armé ou non ; jamais de +1, qui n'y existe pas
  it("tells the gauge and whether Trace is on in Draft, with no reward", () => {
    expect(toPillFacts(drafting(true))).toEqual({
      pill: "draft",
      charges: 4,
      canClaim: false,
      isTouchTracing: true,
    });
  });

  // Pendant une reprise de connexion, elle garde ce qu'elle montrait : la bulle attend, elle ne se clôt pas
  it("keeps what the pill showed during a reconnection", () => {
    expect(toPillFacts({ kind: "reconnecting", shown: drafting(false) }).pill).toBe("draft");
  });

  // Invité, banni, connexion en cours ou perdue : pas de pill à viser, donc ni jauge ni cible
  it("tells nothing when there is no pill to aim at", () => {
    const none = { pill: undefined, charges: undefined, canClaim: false, isTouchTracing: false };
    expect(toPillFacts({ kind: "connecting" })).toEqual(none);
    expect(toPillFacts({ kind: "banned" })).toEqual(none);
    expect(toPillFacts({ kind: "guest", signInHref: "#" })).toEqual(none);
    expect(toPillFacts({ kind: "closed" })).toEqual(none);
  });
});
