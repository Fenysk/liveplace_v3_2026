import { describe, expect, it } from "vitest";
import type { FirstHintView } from "../../state/first-hint";
import {
  type FirstHintContext,
  HINT_CLOSE_BEAT_MS,
  type HintAside,
  isHintBeating,
  toFirstHintProps,
} from "./first-hint-props";

const ready: FirstHintContext = {
  isReady: true,
  isSettled: false,
  isDrafting: false,
  isInspecting: false,
  isYielding: false,
};
const open = (...done: ("pan" | "zoom" | "inspect")[]): FirstHintView => ({ status: "open", done });

describe("ce que montre le conseil de première visite (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Fermé (PC, déjà vu, stockage refusé), il n'y a rien à monter
  it("mounts nothing when the hint is off", () => {
    expect(toFirstHintProps({ status: "off" }, ready)).toBeUndefined();
  });

  // Ouvert et le canvas affiché depuis un moment, il montre un point par geste fait
  it("shows one dot per step done once the canvas has been shown for a while", () => {
    expect(toFirstHintProps(open(), ready)).toEqual({ doneCount: 0, isVisible: true });
    expect(toFirstHintProps(open("zoom", "pan"), ready)).toEqual({ doneCount: 2, isVisible: true });
  });

  // Avant l'heure, elle est dans la page mais cachée : elle paraît en fondu
  it("is in the page but not visible before the canvas has been shown for a while", () => {
    expect(toFirstHintProps(open("pan"), { ...ready, isReady: false })).toEqual({
      doneCount: 1,
      isVisible: false,
    });
  });

  // En Dessin et pendant l'inspection, elle se cache ; elle revient dès que ça cesse
  it("hides in Draft mode and while the inspection is open, and comes back after", () => {
    const aside = { doneCount: 1, isVisible: false };
    expect(toFirstHintProps(open("pan"), { ...ready, isDrafting: true })).toEqual(aside);
    expect(toFirstHintProps(open("pan"), { ...ready, isInspecting: true })).toEqual(aside);
    expect(toFirstHintProps(open("pan"), ready)).toEqual({ doneCount: 1, isVisible: true });
  });

  // Une bulle d'aide montrée, ou qui attend son tour, passe avant : le conseil se cache sans partir, et revient quand elle a fini
  it("steps aside for a help bubble, and comes back when it is done", () => {
    expect(toFirstHintProps(open("pan"), { ...ready, isYielding: true })).toEqual({
      doneCount: 1,
      isVisible: false,
    });
    expect(toFirstHintProps(open("pan"), ready)).toEqual({ doneCount: 1, isVisible: true });
  });

  // Le dernier geste fait, les trois points restent remplis le temps d'un battement, puis elle s'efface
  it("keeps the three dots filled for a beat once the last step is done, then fades", () => {
    expect(toFirstHintProps({ status: "done" }, ready)).toEqual({ doneCount: 3, isVisible: true });
    expect(toFirstHintProps({ status: "done" }, { ...ready, isSettled: true })).toEqual({
      doneCount: 3,
      isVisible: false,
    });
  });

  // Le battement écoulé, elle ne revient plus, cachée ou non
  it("never comes back after the beat, whatever hides it", () => {
    const settled = { ...ready, isSettled: true };
    expect(toFirstHintProps({ status: "done" }, { ...settled, isDrafting: true })?.isVisible).toBe(false);
    expect(toFirstHintProps({ status: "done" }, settled)?.isVisible).toBe(false);
  });

  // Les trois points restent remplis deux secondes (Écart §8.1, JOURNAL 2026-10-09)
  it("keeps the last dot filled for two seconds", () => {
    expect(HINT_CLOSE_BEAT_MS).toBe(2000);
  });
});

describe("le battement du dernier point (Écart §8.1, JOURNAL 2026-10-09)", () => {
  const shown: HintAside = { isReady: true, isDrafting: false, isInspecting: false, isYielding: false };

  // Il court quand la bulle est là avec ses trois points : pas avant, tant que le troisième geste n'est pas fait
  it("runs only once the third step is done, with the bubble shown", () => {
    expect(isHintBeating({ status: "done" }, shown)).toBe(true);
    expect(isHintBeating(open("pan", "zoom"), shown)).toBe(false);
    expect(isHintBeating({ status: "off" }, shown)).toBe(false);
  });

  // Caché au troisième geste (Dessin, inspection, une bulle d'aide), le temps ne court pas sous la feuille : il part au retour
  it("does not run while the bubble is aside, so the last dot is seen filled at its return", () => {
    const aside = [
      { ...shown, isReady: false },
      { ...shown, isDrafting: true },
      { ...shown, isInspecting: true },
      { ...shown, isYielding: true },
    ];
    for (const context of aside) {
      expect(isHintBeating({ status: "done" }, context)).toBe(false);
      expect(toFirstHintProps({ status: "done" }, { ...context, isSettled: false })).toEqual({
        doneCount: 3,
        isVisible: false,
      });
    }
    expect(toFirstHintProps({ status: "done" }, { ...shown, isSettled: false })?.isVisible).toBe(true);
  });
});
