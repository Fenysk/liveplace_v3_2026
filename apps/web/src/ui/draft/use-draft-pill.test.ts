import { toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Draft } from "../../state/draft";
import type { ShowToast } from "../design/toast";
import { DRAFT_TEXTS } from "./draft-texts";
import { discardWithRestore } from "./use-draft-pill";

// Vider se rattrape : un toast « Brouillon vidé » porte le bouton Rétablir (Écart §9.3, JOURNAL 2026-10-13).

const CLEARED: Draft = new Map([[toCellKey(1, 1), { x: 1, y: 1, colorIndex: 4 }]]);

const run = (cleared: Draft | undefined) => {
  const toasts: Parameters<ShowToast>[] = [];
  const restored: Draft[] = [];
  const store = {
    discardDraft: () => cleared,
    restoreDraft: (draft: Draft) => {
      restored.push(draft);
    },
  };
  discardWithRestore(store, (...toast) => toasts.push(toast), DRAFT_TEXTS.fr);
  return { toasts, restored };
};

describe("Vider et son toast", () => {
  // Quelque chose a été vidé : le toast le dit et propose Rétablir, qui remet ce brouillon-là
  it("says the draft was cleared and offers to restore that very draft", () => {
    const { toasts, restored } = run(CLEARED);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.[0]).toBe("success");
    expect(toasts[0]?.[1]).toBe("Brouillon vidé");
    expect(toasts[0]?.[2]?.label).toBe("Rétablir");
    toasts[0]?.[2]?.onPress();
    expect(restored).toEqual([CLEARED]);
  });

  // Rien n'a été vidé (brouillon vide, envoi en cours) : pas de toast
  it("says nothing when there was nothing to clear", () => {
    expect(run(undefined).toasts).toEqual([]);
  });

  // Chaque langue a ses mots
  it("has the words in both languages", () => {
    expect(DRAFT_TEXTS.en.draftCleared).toBe("Draft cleared");
    expect(DRAFT_TEXTS.en.restoreDraft).toBe("Restore");
  });
});
