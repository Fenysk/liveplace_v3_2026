import { describe, expect, it } from "vitest";
import { SKELETON_DELAY_MS, toSkeletonPhase } from "./use-skeleton-phase";

describe("la phase d'un squelette", () => {
  // Le squelette n'est jamais montré avant 200 ms : une réponse plus rapide ne le fait pas clignoter
  it("waits 200 ms before showing the skeleton", () => {
    expect(SKELETON_DELAY_MS).toBe(200);
    expect(toSkeletonPhase({ isLoading: true, isElapsed: false, hasShown: false })).toBe("pending");
  });

  // Quand l'attente dépasse 200 ms, le squelette se voit
  it("shows the skeleton once the wait lasts longer than the delay", () => {
    expect(toSkeletonPhase({ isLoading: true, isElapsed: true, hasShown: false })).toBe("shown");
  });

  // Quand les données arrivent avant 200 ms, le contenu paraît seul, sans fondu
  it("gives the content alone when the data arrives before the skeleton was seen", () => {
    expect(toSkeletonPhase({ isLoading: false, isElapsed: false, hasShown: false })).toBe("ready");
  });

  // Quand les données arrivent après que le squelette s'est vu, le contenu le remplace en fondu
  it("reveals the content when it replaces a skeleton that was seen", () => {
    expect(toSkeletonPhase({ isLoading: false, isElapsed: false, hasShown: true })).toBe("revealed");
  });

  // Le minuteur se remet à zéro un rendu après la fin de l'attente : ce rendu-là montre déjà le contenu
  it("shows the content from the first render after the data arrives", () => {
    expect(toSkeletonPhase({ isLoading: false, isElapsed: true, hasShown: true })).toBe("revealed");
    expect(toSkeletonPhase({ isLoading: false, isElapsed: true, hasShown: false })).toBe("ready");
  });
});
