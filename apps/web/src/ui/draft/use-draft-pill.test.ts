import { PALETTE, toCellKey } from "@liveplace/domain";
import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createCanvasStore } from "../../state/canvas-store";
import type { Draft } from "../../state/draft";
import { createDraftStore } from "../../state/draft-store";
import type { ShowToast } from "../design/toast";
import { DRAFT_TEXTS } from "./draft-texts";
import { discardWithRestore, useDraftPillProps } from "./use-draft-pill";

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

// Sur de vrais stores : la pill lit l'historique du brouillon, et ses boutons agissent sur lui (CDC 2026, §8 Historique).
describe("Annuler et Rétablir de la pill Dessin", () => {
  const NOW = 1_700_000_000_000;
  const welcome: ServerFrame = {
    t: "welcome",
    canvas: { canvasId: "canvas-1", width: 256, height: 4, ownerId: "owner-1" },
    params: {
      gaugeMaxStart: 200,
      gaugeMaxCeiling: 200,
      refillMs: 10_000,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: [...PALETTE],
    version: 1,
    you: { userId: "user-1", login: "user1", displayName: "User 1", role: "viewer" },
    gauge: { charges: 200, max: 200, nextRefillAt: NOW + 10_000, claimable: 0 },
  };

  const openStores = () => {
    const listening: { listeners?: TransportListeners } = {};
    const transport: Transport = {
      send: () => undefined,
      listen: (listeners) => {
        listening.listeners = listeners;
      },
      close: () => undefined,
    };
    const canvas = createCanvasStore("canvas-1", transport, {
      mode: "ui",
      now: () => NOW,
      reload: () => undefined,
    });
    listening.listeners?.onOpen();
    listening.listeners?.onFrame(welcome);
    const draft = createDraftStore(
      "canvas-1",
      canvas,
      () => ({ getItem: () => null, setItem: () => undefined }),
      { now: () => NOW, wait: async () => undefined },
    );
    draft.enterDraftMode();
    return { canvas, draft };
  };

  // Ce que la page donne à la pill, lu en rendant le hook une fois
  const pillOf = (stores: ReturnType<typeof openStores>) => {
    const seen: { pill?: ReturnType<typeof useDraftPillProps> } = {};
    const Probe = () => {
      seen.pill = useDraftPillProps(stores, "user1", { isSigningIn: false, onSignIn: () => undefined });
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    const { state, actions } = seen.pill ?? {};
    if (state?.kind !== "draft" || !actions) throw new Error("la pill n'est pas en Dessin");
    return { state, actions };
  };

  // Rien n'est annulable au départ ; un trait donne Annuler ; Annuler donne Rétablir, qui redonne Annuler
  it("greys both at first, offers Annuler after a stroke, and each press does what Ctrl+Z and Ctrl+Maj+Z do", () => {
    const stores = openStores();
    expect(pillOf(stores).state).toMatchObject({ canUndo: false, canRedo: false });

    stores.draft.toggleCell(1, 1);
    expect(pillOf(stores).state).toMatchObject({ canUndo: true, canRedo: false });

    pillOf(stores).actions.onUndo();
    expect(stores.draft.getView().draft.size).toBe(0);
    expect(pillOf(stores).state).toMatchObject({ canUndo: false, canRedo: true });

    pillOf(stores).actions.onRedo();
    expect(stores.draft.getView().draft.size).toBe(1);
    expect(pillOf(stores).state).toMatchObject({ canUndo: true, canRedo: false });
  });
});
