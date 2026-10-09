import { type CellKey, toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Pixel } from "./canvas-store";
import type { Draft } from "./draft";
import { EMPTY_DRAFT_HISTORY, recordDraftStep, redoDraftStep, undoDraftStep } from "./draft-history";

const draftOf = (...cells: number[]): Draft =>
  new Map(cells.map((x): [CellKey, Pixel] => [toCellKey(x, 0), { x, y: 0, colorIndex: 4 }]));

const xsOf = (draft: Draft) => [...draft.values()].map(({ x }) => x);

describe("recordDraftStep (CDC 2026, §8 Historique)", () => {
  // Une étape de plus : le brouillon d'avant entre dans le passé
  it("puts the draft from before in the past", () => {
    const history = recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1));

    expect(history.past.map(xsOf)).toEqual([[1]]);
    expect(history.future).toEqual([]);
  });

  // Une nouvelle étape efface ce qui pouvait être rétabli
  it("empties what could be redone", () => {
    const undone = undoDraftStep(recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1)), draftOf(1, 2));
    expect(undone?.history.future).toHaveLength(1);

    const history = recordDraftStep(undone?.history ?? EMPTY_DRAFT_HISTORY, draftOf(1));

    expect(history.future).toEqual([]);
  });

  // Garde les étapes dans l'ordre où elles sont venues
  it("keeps the steps in the order they came", () => {
    let history = EMPTY_DRAFT_HISTORY;
    for (const x of [1, 2, 3]) history = recordDraftStep(history, draftOf(x));

    expect(history.past.map(xsOf)).toEqual([[1], [2], [3]]);
  });

  // Ne modifie jamais l'historique qu'on lui donne
  it("never changes the history it is given", () => {
    const before = recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1));

    recordDraftStep(before, draftOf(1, 2));

    expect(before.past).toHaveLength(1);
  });
});

describe("undoDraftStep and redoDraftStep (CDC 2026, §8 Historique)", () => {
  // Annuler rend le brouillon d'avant et met l'actuel au bout de ce qu'on peut rétablir
  it("undoes to the draft from before, and puts the current one first in what can be redone", () => {
    const history = recordDraftStep(recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf()), draftOf(1));

    const undone = undoDraftStep(history, draftOf(1, 2));

    expect(undone && xsOf(undone.draft)).toEqual([1]);
    expect(undone?.history.past.map(xsOf)).toEqual([[]]);
    expect(undone?.history.future.map(xsOf)).toEqual([[1, 2]]);
  });

  // Rétablir est l'inverse : le brouillon d'après revient, l'actuel retourne au passé
  it("redoes to the draft from after, and puts the current one back in the past", () => {
    const history = recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1));
    const undone = undoDraftStep(history, draftOf(1, 2));

    const redone = undone && redoDraftStep(undone.history, undone.draft);

    expect(redone && xsOf(redone.draft)).toEqual([1, 2]);
    expect(redone?.history.past.map(xsOf)).toEqual([[1]]);
    expect(redone?.history.future).toEqual([]);
  });

  // Annuler puis rétablir rend le même brouillon, pas une copie
  it("gives back the very same draft after an undo then a redo", () => {
    const after = draftOf(1, 2);
    const history = recordDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1));
    const undone = undoDraftStep(history, after);

    const redone = undone && redoDraftStep(undone.history, undone.draft);

    expect(redone?.draft).toBe(after);
  });

  // Plusieurs annulations remontent les étapes dans l'ordre inverse, puis s'arrêtent
  it("goes back through the steps in reverse order, then stops", () => {
    let history = EMPTY_DRAFT_HISTORY;
    history = recordDraftStep(history, draftOf());
    history = recordDraftStep(history, draftOf(1));
    history = recordDraftStep(history, draftOf(1, 2));

    const first = undoDraftStep(history, draftOf(1, 2, 3));
    const second = first && undoDraftStep(first.history, first.draft);
    const third = second && undoDraftStep(second.history, second.draft);
    const fourth = third && undoDraftStep(third.history, third.draft);

    expect([first, second, third].map((travel) => travel && xsOf(travel.draft))).toEqual([[1, 2], [1], []]);
    expect(fourth).toBeNull();
  });

  // Sans passé, rien à annuler ; sans futur, rien à rétablir
  it("has nothing to undo without a past, and nothing to redo without a future", () => {
    expect(undoDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1))).toBeNull();
    expect(redoDraftStep(EMPTY_DRAFT_HISTORY, draftOf(1))).toBeNull();
  });
});
