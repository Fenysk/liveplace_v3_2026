import { describe, expect, it } from "vitest";
import { createFirstHint, FIRST_HINT_KEY } from "./first-hint";
import { HELP_BUBBLES } from "./help-bubbles";
import { createPlacementCount } from "./placement-count";
import { type BubbleStorage, createSeenBubbles } from "./seen-bubbles";
import { restartTutorial } from "./tutorial";

const createFakeStorage = (): BubbleStorage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
};

// Un appareil qui a tout vu : toutes les bulles, le conseil de première visite fini, trois dessins posés.
const veteran = () => {
  const storage = createFakeStorage();
  const seen = createSeenBubbles(() => storage);
  const firstHint = createFirstHint({ seen, getStorage: () => storage });
  const placements = createPlacementCount(() => storage);
  for (const bubble of HELP_BUBBLES) seen.markSeen(bubble);
  for (const step of ["pan", "zoom", "inspect"] as const) firstHint.record(step);
  for (let turn = 0; turn < 3; turn++) placements.record();
  return { storage, seen, firstHint, placements };
};

describe("rejouer le tutoriel (Écart §8.1, JOURNAL 2026-10-12)", () => {
  // Les trois mémoires repartent de zéro d'un coup : chaque bulle, le conseil, les dessins posés
  it("forgets every seen bubble, the first-visit hint and the placements at once", () => {
    const { seen, firstHint, placements } = veteran();
    expect(HELP_BUBBLES.every((bubble) => seen.isSeen(bubble))).toBe(true);
    expect(firstHint.getView()).toEqual({ status: "done" });

    restartTutorial({ seen, firstHint, placements });

    expect(HELP_BUBBLES.some((bubble) => seen.isSeen(bubble))).toBe(false);
    expect(seen.isSeen(FIRST_HINT_KEY)).toBe(false);
    expect(firstHint.getView()).toEqual({ status: "open", done: [] });
    expect(placements.getCount()).toBe(0);
  });

  // Rien du tutoriel ne reste dans le navigateur : la visite suivante repart de zéro aussi
  it("leaves nothing of the tutorial in the storage", () => {
    const { storage, seen, firstHint, placements } = veteran();

    restartTutorial({ seen, firstHint, placements });

    expect([...storage.entries.keys()]).toEqual([]);
  });

  // Ce qui n'est pas du tutoriel reste : une autre clé du navigateur n'est pas touchée
  it("touches nothing that is not the tutorial", () => {
    const { storage, seen, firstHint, placements } = veteran();
    storage.setItem("liveplace:theme", "dark");

    restartTutorial({ seen, firstHint, placements });

    expect([...storage.entries.entries()]).toEqual([["liveplace:theme", "dark"]]);
  });

  // Rejouer deux fois de suite ne casse rien
  it("can be played twice in a row", () => {
    const { seen, firstHint, placements } = veteran();

    restartTutorial({ seen, firstHint, placements });
    restartTutorial({ seen, firstHint, placements });

    expect(firstHint.getView()).toEqual({ status: "open", done: [] });
    expect(HELP_BUBBLES.some((bubble) => seen.isSeen(bubble))).toBe(false);
  });
});
