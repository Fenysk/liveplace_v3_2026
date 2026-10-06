import { PALETTE, toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { CanvasView, Pixel, PlaceResult } from "./canvas-store";
import { createDraftStore, type DraftCanvas, type DraftClock } from "./draft-store";
import type { DraftStorage } from "./saved-draft";

const now = 1_700_000_000_000;
const refillMs = 10_000;

const guestView = (overrides: Partial<CanvasView> = {}): CanvasView => ({
  status: "live",
  width: 256,
  height: 4,
  palette: PALETTE,
  version: 1,
  role: "guest",
  params: {
    gaugeMaxStart: 200,
    gaugeMaxCeiling: 150,
    refillMs,
    refillCharges: 1,
    obsDelayMs: 5000,
    obsBackground: "transparent",
  },
  gauge: null,
  reportCount: 0,
  lastError: null,
  inspection: null,
  isBanned: false,
  pixels: new Uint8Array(256 * 4).fill(9),
  ...overrides,
});

const liveView = (overrides: Partial<CanvasView> = {}): CanvasView =>
  guestView({
    role: "viewer",
    userId: "user-1",
    displayName: "User 1",
    gauge: { charges: 200, max: 200, nextRefillAt: now + refillMs, claimable: 0 },
    ...overrides,
  });

// `onPlace` : ce qui arrive pendant qu'un lot part, avant sa réponse.
type Setup = { view?: CanvasView; results?: PlaceResult[]; saved?: string; onPlace?: () => void };

const setup = ({ view = liveView(), results = [], saved, onPlace }: Setup = {}) => {
  let canvasView = view;
  const canvasListeners = new Set<() => void>();
  const sentBatches: Pixel[][] = [];
  const sentPlacementIds: string[] = [];
  const canvas: DraftCanvas = {
    subscribe: (listener) => {
      canvasListeners.add(listener);
      return () => canvasListeners.delete(listener);
    },
    getView: () => canvasView,
    placeBatch: async (pixels, placementId) => {
      sentBatches.push([...pixels]);
      sentPlacementIds.push(placementId);
      onPlace?.();
      const accepted = { ok: true as const, value: acceptAll(pixels) };
      return results.shift() ?? accepted;
    },
  };
  const entries = new Map<string, string>();
  if (saved) entries.set("liveplace:draft:canvas-1:user-1", saved);
  const storage: DraftStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
  const clock = { current: now, waits: [] as number[] };
  const draftClock: DraftClock = {
    now: () => clock.current,
    wait: async (ms) => {
      clock.waits.push(ms);
      clock.current += ms;
    },
  };
  const store = createDraftStore("canvas-1", canvas, () => storage, draftClock);
  const setCanvasView = (next: CanvasView) => {
    canvasView = next;
    for (const listener of canvasListeners) listener();
  };
  const cells = () => [...store.getView().draft.values()];
  return { store, sentBatches, sentPlacementIds, entries, clock, setCanvasView, cells };
};

const acceptAll = (pixels: readonly Pixel[]) => ({
  t: "ack" as const,
  requestId: "request",
  accepted: pixels.length,
  rejected: [],
  gauge: { charges: 0, max: 200, nextRefillAt: now + refillMs, claimable: 0 },
});

describe("createDraftStore — the modes (CDC 2026)", () => {
  // Relit le brouillon sauvegardé de cet utilisateur dès que le welcome est là
  it("reads this user's saved draft back as soon as the welcome is there", () => {
    const { store, setCanvasView } = setup({
      view: guestView({ status: "connecting", role: "viewer" }),
      saved: JSON.stringify([{ x: 1, y: 1, colorIndex: 4 }]),
    });
    expect(store.getView().draft.size).toBe(0);

    setCanvasView(liveView());

    expect(store.getView().draft.get(toCellKey(1, 1))).toEqual({ x: 1, y: 1, colorIndex: 4 });
  });

  // Ne laisse pas un invité entrer en Dessin
  it("keeps a guest out of draft mode", () => {
    const { store } = setup({ view: guestView() });

    store.enterDraftMode();

    expect(store.getView().mode).toBe("view");
  });

  // Un invité reste en Vue quoi qu'il fasse : la pill Dessin lui montre déjà l'invitation (CDC 2026)
  it("keeps a guest in view mode whatever it does, the draft pill already showing the invitation", () => {
    const { store } = setup({ view: guestView() });

    store.enterDraftMode();
    expect(store.getView().mode).toBe("view");

    store.toggleCell(1, 1);
    expect(store.getView().draft.size).toBe(0);

    store.exitDraftMode();
    expect(store.getView().mode).toBe("view");
  });

  // Un compte connecté entre en Dessin, et personne avant le `welcome`
  it("lets a signed-in user into draft mode, and nobody before the welcome", () => {
    const signedIn = setup();
    signedIn.store.enterDraftMode();
    expect(signedIn.store.getView().mode).toBe("draft");

    const connecting = setup({ view: guestView({ status: "connecting" }) });
    connecting.store.enterDraftMode();
    expect(connecting.store.getView().mode).toBe("view");
  });

  // Ne touche au brouillon qu'en Dessin, et le sauvegarde à chaque changement
  it("edits the draft only in draft mode, and saves it on every change", () => {
    const { store, entries, cells } = setup();

    store.toggleCell(1, 1);
    expect(cells()).toEqual([]);

    store.enterDraftMode();
    store.toggleCell(1, 1);

    expect(cells()).toEqual([{ x: 1, y: 1, colorIndex: store.getView().colorIndex }]);
    expect(JSON.parse(entries.get("liveplace:draft:canvas-1:user-1") ?? "[]")).toEqual(cells());
  });

  // Garde le brouillon en sortant du Dessin, et Vider le vide
  it("keeps the draft when leaving draft mode, and discarding empties it", () => {
    const { store, cells } = setup();
    store.enterDraftMode();
    store.toggleCell(1, 1);

    store.exitDraftMode();
    expect(store.getView().mode).toBe("view");
    expect(cells()).toHaveLength(1);

    store.enterDraftMode();
    store.discardDraft();
    expect(cells()).toEqual([]);
  });

  // Bascule la gomme avec E, et revient à la dernière couleur
  it("toggles the eraser, then back to the last color", () => {
    const { store } = setup();
    store.enterDraftMode();
    store.selectColor(12);

    store.toggleEraser();
    expect(store.getView().colorIndex).toBe(0);

    store.toggleEraser();
    expect(store.getView().colorIndex).toBe(12);
  });

  // Sur mobile, une couleur nouvelle prend le bouton et celle qu'elle remplace entre en tête de la rangée ;
  // une couleur de la rangée s'échange avec celle du bouton, sur place
  it("puts the replaced color first for a new color, and swaps in place for a recent one", () => {
    const { store } = setup();
    const first = store.getView().colorIndex;
    const before = store.getView().recentColorIndexes;

    store.selectColor(12);
    expect(store.getView().recentColorIndexes).toEqual([first, ...before.slice(0, 4)]);

    const row = store.getView().recentColorIndexes;
    store.selectColor(row[2] ?? 0);
    expect(store.getView()).toMatchObject({
      colorIndex: row[2],
      recentColorIndexes: row.map((index) => (index === row[2] ? 12 : index)),
    });
  });

  // Gomme armée, une couleur de la rangée s'échange avec la couleur d'avant la gomme : aucune ne se perd
  it("swaps a recent color with the color the eraser replaced", () => {
    const { store } = setup();
    store.selectColor(12);
    store.toggleEraser();
    const row = store.getView().recentColorIndexes;

    store.selectColor(row[1] ?? 0);
    expect(store.getView()).toMatchObject({
      colorIndex: row[1],
      recentColorIndexes: row.map((index) => (index === row[1] ? 12 : index)),
    });
  });

  // La pipette prend la couleur réellement posée, jamais celle du brouillon, sort de la gomme, et E la retrouve
  it("the picker takes the color actually placed, never the draft's, leaves the eraser, and E finds it again", () => {
    const { store, cells } = setup();
    store.enterDraftMode();
    store.selectColor(12);
    store.toggleCell(3, 1);
    store.toggleEraser();

    store.togglePicker();
    store.toggleCell(3, 1);

    expect(store.getView()).toMatchObject({ colorIndex: 9, isPicking: false });
    expect(cells()).toEqual([{ x: 3, y: 1, colorIndex: 12 }]);
    store.toggleEraser();
    store.toggleEraser();
    expect(store.getView().colorIndex).toBe(9);
  });

  // Sur un pixel transparent, la pipette ne fait rien et reste armée
  it("on a transparent pixel, the picker does nothing and stays armed", () => {
    const { store, setCanvasView } = setup();
    setCanvasView(liveView({ pixels: new Uint8Array(256 * 4) }));
    store.enterDraftMode();
    store.selectColor(12);

    store.togglePicker();
    store.toggleCell(0, 0);

    expect(store.getView()).toMatchObject({ colorIndex: 12, isPicking: true });
    expect(store.getView().draft.size).toBe(0);
  });

  // La rangée ne montre jamais la couleur du bouton : aucun doublon
  it("never has the active color in the row", () => {
    const { store } = setup();

    expect(store.getView().recentColorIndexes).not.toContain(store.getView().colorIndex);
  });
});

describe("createDraftStore — the cap (CDC 2026)", () => {
  // Plafonne aux charges prévues : une recharge arrivée depuis le dernier ack compte déjà
  it("caps at the predicted charges: a refill that came since the last ack already counts", () => {
    const { store, cells } = setup({
      view: liveView({ gauge: { charges: 0, max: 200, nextRefillAt: now, claimable: 0 } }),
    });
    store.enterDraftMode();

    store.toggleCell(1, 1);
    store.toggleCell(2, 1);

    expect(cells()).toHaveLength(1);
    expect(store.getView().shakeCount).toBe(1);
  });

  // Ne fait vibrer la jauge qu'une fois par tracé, et de nouveau au tracé suivant
  it("shakes the gauge once per trace, and again on the next trace", () => {
    const { store, cells } = setup({
      view: liveView({ gauge: { charges: 2, max: 200, nextRefillAt: now + refillMs, claimable: 0 } }),
    });
    store.enterDraftMode();

    store.startTrace();
    store.traceCells([0, 1, 2].map((x) => ({ x, y: 0 })));
    store.traceCells([3, 4].map((x) => ({ x, y: 0 })));
    store.endTrace();
    expect(cells()).toHaveLength(2);
    expect(store.getView().shakeCount).toBe(1);

    store.startTrace();
    store.traceCells([{ x: 5, y: 0 }]);
    expect(store.getView().shakeCount).toBe(2);
  });

  // N'allume le Toggle tracé qu'en Dessin, et l'éteint en sortant du Dessin
  it("turns touch tracing on only in draft mode, and off when leaving draft mode", () => {
    const { store } = setup();

    store.toggleTouchTracing();
    expect(store.getView().isTouchTracing).toBe(false);

    store.enterDraftMode();
    store.toggleTouchTracing();
    expect(store.getView().isTouchTracing).toBe(true);

    store.exitDraftMode();
    expect(store.getView().isTouchTracing).toBe(false);
  });

  // Ne trace rien hors d'un tracé
  it("traces nothing outside a trace", () => {
    const { store, cells } = setup();
    store.enterDraftMode();

    store.traceCells([{ x: 0, y: 0 }]);

    expect(cells()).toEqual([]);
  });
});

describe("createDraftStore — submit (CDC 2026, §6.3)", () => {
  const fill = (store: ReturnType<typeof setup>["store"], count: number) => {
    store.enterDraftMode();
    store.startTrace();
    store.traceCells(Array.from({ length: count }, (_, x) => ({ x, y: 0 })));
    store.endTrace();
  };

  // Envoie par lots de 64, jamais plus de 8 par seconde, et vide le brouillon des acceptés
  it("sends batches of 64, never more than 8 per second, and empties the draft of the accepted", async () => {
    const { store, sentBatches, clock, cells } = setup();
    fill(store, 130);

    await store.submit();

    expect(sentBatches.map((batch) => batch.length)).toEqual([64, 64, 2]);
    expect(clock.waits).toEqual([125, 125]);
    expect(cells()).toEqual([]);
    expect(store.getView().isSending).toBe(false);
  });

  // Tous les lots d'une validation portent la même pose ; la validation suivante en tire une autre (JOURNAL 2026-09-28)
  it("gives every batch of one validation the same placement, and the next validation another one", async () => {
    const { store, sentPlacementIds } = setup();
    fill(store, 130);
    await store.submit();
    fill(store, 1);
    await store.submit();

    const [first, second, third, next] = sentPlacementIds;
    expect([second, third]).toEqual([first, first]);
    expect(next).not.toBe(first);
    for (const placementId of sentPlacementIds) expect(placementId).toMatch(/^[a-z][a-z0-9]{7,31}$/);
  });

  // Garde les refusés dans le brouillon
  it("keeps the rejected in the draft", async () => {
    const { store, cells } = setup({
      results: [
        {
          ok: true,
          value: { ...acceptAll([]), accepted: 1, rejected: [{ index: 1, reason: "gauge" }] },
        },
      ],
    });
    fill(store, 2);

    await store.submit();

    expect(cells()).toEqual([{ x: 1, y: 0, colorIndex: store.getView().colorIndex }]);
    expect(store.getView().mode).toBe("draft");
  });

  // Revient en Vue tout seul quand tout le brouillon est posé
  it("goes back to view mode on its own once the whole draft is placed", async () => {
    const { store, cells } = setup();
    fill(store, 3);

    await store.submit();

    expect(cells()).toEqual([]);
    expect(store.getView().mode).toBe("view");
  });

  // S'arrête quand la connexion tombe, et garde tout ce qui n'est pas confirmé
  it("stops when the connection drops, and keeps everything not confirmed", async () => {
    const { store, sentBatches, cells } = setup({ results: [{ ok: false, error: "closed" }] });
    fill(store, 70);

    await store.submit();

    expect(sentBatches).toHaveLength(1);
    expect(cells()).toHaveLength(70);
    expect(store.getView().isSending).toBe(false);
  });

  // Ne valide rien quand la connexion n'est pas en direct, ni quand le brouillon est vide
  it("submits nothing when the connection is not live, nor when the draft is empty", async () => {
    const empty = setup();
    await empty.store.submit();
    expect(empty.sentBatches).toEqual([]);

    const closed = setup();
    fill(closed.store, 2);
    closed.setCanvasView(liveView({ status: "closed" }));
    await closed.store.submit();
    expect(closed.sentBatches).toEqual([]);
  });

  // Verrouille le brouillon pendant l'envoi
  it("locks the draft while sending", async () => {
    const { store, cells } = setup();
    fill(store, 2);

    const sending = store.submit();
    expect(store.getView().isSending).toBe(true);
    store.toggleCell(9, 3);
    store.exitDraftMode();
    expect(store.getView().mode).toBe("draft");
    await sending;

    expect(store.getView().isSending).toBe(false);
    expect(cells()).toEqual([]);
  });
});

describe("createDraftStore — a banned user (§10.2, JOURNAL 2026-09-25)", () => {
  const fill = (store: ReturnType<typeof setup>["store"], count: number) => {
    store.enterDraftMode();
    store.startTrace();
    store.traceCells(Array.from({ length: count }, (_, x) => ({ x, y: 0 })));
    store.endTrace();
  };

  // Sort du Dessin quand il est banni, n'y revient plus, n'envoie rien, et garde son brouillon
  it("leaves draft mode once banned, never enters it again, sends nothing, and keeps the draft", async () => {
    const { store, sentBatches, setCanvasView, cells } = setup();
    fill(store, 3);

    setCanvasView(liveView({ isBanned: true }));
    store.enterDraftMode();
    await store.submit();

    expect(store.getView().mode).toBe("view");
    expect(sentBatches).toEqual([]);
    expect(cells()).toHaveLength(3);
  });

  // Arrête l'envoi quand le ban tombe pendant qu'il part : les lots suivants ne partent pas
  it("stops sending when the ban lands mid-send: the next batches never leave", async () => {
    const context: { ban?: () => void } = {};
    const banned = {
      ...acceptAll([]),
      rejected: Array.from({ length: 64 }, (_, index) => ({ index, reason: "banned" })),
    };
    const { store, sentBatches, setCanvasView, cells } = setup({
      results: [{ ok: true, value: banned }],
      onPlace: () => context.ban?.(),
    });
    context.ban = () => setCanvasView(liveView({ isBanned: true }));
    fill(store, 130);

    await store.submit();

    expect(sentBatches).toHaveLength(1);
    expect(cells()).toHaveLength(130);
    expect(store.getView()).toMatchObject({ mode: "view", isSending: false });
  });
});

describe("createDraftStore — Retour arrière (CDC 2026, raccourcis)", () => {
  // Retire la case du brouillon, même pipette armée, et le brouillon sauvegardé suit
  it("takes the cell out of the draft, even with the picker armed, and the saved draft follows", () => {
    const { store, cells, entries } = setup();
    store.enterDraftMode();
    store.toggleCell(1, 1);
    store.toggleCell(2, 1);
    store.togglePicker();

    store.discardCell(1, 1);

    expect(cells()).toEqual([{ x: 2, y: 1, colorIndex: 1 }]);
    expect(store.getView().isPicking).toBe(true);
    expect(entries.get("liveplace:draft:canvas-1:user-1")).toBe(
      JSON.stringify([{ x: 2, y: 1, colorIndex: 1 }]),
    );
  });

  // En Vue, le brouillon ne bouge pas
  it("leaves the draft alone in view mode", () => {
    const { store, cells } = setup();
    store.enterDraftMode();
    store.toggleCell(1, 1);
    store.exitDraftMode();

    store.discardCell(1, 1);

    expect(cells()).toEqual([{ x: 1, y: 1, colorIndex: 1 }]);
  });
});
