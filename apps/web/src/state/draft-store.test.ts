import { PALETTE, toCellKey } from "@liveplace/domain";
import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import type { ClientFrame, ServerFrame } from "@liveplace/protocol";
import { describe, expect, it, vi } from "vitest";
import { type CanvasView, createCanvasStore, type Pixel, type PlaceResult } from "./canvas-store";
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
  isArchived: false,
  isDiscarded: false,
  isImageLoaded: true,
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
// `entries` : le stockage d'un store précédent (la page rechargée) ; `isStorageRefused` : l'accès au stockage lève.
type Setup = {
  view?: CanvasView;
  results?: PlaceResult[];
  saved?: string;
  onPlace?: () => void;
  entries?: Map<string, string>;
  isStorageRefused?: boolean;
  onPlaced?: () => void; // tout le brouillon vient d'être posé (Écart §8.1, JOURNAL 2026-10-12)
};

const setup = ({
  view = liveView(),
  results = [],
  saved,
  onPlace,
  entries = new Map<string, string>(),
  isStorageRefused = false,
  onPlaced,
}: Setup = {}) => {
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
  const getStorage = (): DraftStorage => {
    if (isStorageRefused) throw new Error("stockage refusé");
    return storage;
  };
  const store = createDraftStore("canvas-1", canvas, getStorage, draftClock, onPlaced);
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

  // Un abonné qui retrace à chaque publication (la scène, au début d'un tracé) ne boucle pas au plafond
  it("does not loop when a listener traces again on every publish with the gauge empty", () => {
    const { store } = setup({
      view: liveView({ gauge: { charges: 0, max: 200, nextRefillAt: now + refillMs, claimable: 0 } }),
    });
    store.enterDraftMode();
    store.subscribe(() => store.traceCells([{ x: 0, y: 0 }]));

    store.startTrace();

    expect(store.getView().shakeCount).toBe(1);
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

  // Garde le Toggle tracé d'un Dessin au suivant, allumé comme éteint
  it("keeps touch tracing from one draft mode to the next, on or off", () => {
    const { store } = setup();
    store.enterDraftMode();
    store.toggleTouchTracing();

    store.exitDraftMode();
    store.enterDraftMode();
    expect(store.getView().isTouchTracing).toBe(true);

    store.toggleTouchTracing();
    store.exitDraftMode();
    store.enterDraftMode();
    expect(store.getView().isTouchTracing).toBe(false);
  });

  // Un rechargement de la page remet le Toggle tracé à éteint : le choix ne vit que dans le store
  it("starts a new store with touch tracing off, even when the previous one had it on", () => {
    const first = setup();
    first.store.enterDraftMode();
    first.store.toggleTouchTracing();
    expect(first.store.getView().isTouchTracing).toBe(true);

    const reloaded = setup({ entries: first.entries });
    reloaded.store.enterDraftMode();

    expect(reloaded.store.getView().isTouchTracing).toBe(false);
  });

  // En Vue, un doigt déplace toujours : le Toggle tracé retenu ne compte qu'en Dessin
  it("keeps touch tracing off in view mode even when it is on in draft mode", () => {
    const { store } = setup();
    expect(store.getView().isTouchTracing).toBe(false);

    store.enterDraftMode();
    store.toggleTouchTracing();
    expect(store.getView().isTouchTracing).toBe(true);

    store.exitDraftMode();
    expect(store.getView().isTouchTracing).toBe(false);
  });

  // Le Toggle tracé est éteint à la première visite, et n'écrit rien dans le stockage du navigateur
  it("starts with touch tracing off and writes nothing to browser storage", () => {
    const { store, entries } = setup();
    store.enterDraftMode();
    expect(store.getView().isTouchTracing).toBe(false);

    store.toggleTouchTracing();

    expect(entries.size).toBe(0);
  });

  // Un stockage qui refuse l'accès ne gêne pas le Toggle tracé : le choix tient pour la page
  it("keeps touch tracing for the page, without error, when storage refuses access", () => {
    const { store } = setup({ isStorageRefused: true });
    store.enterDraftMode();
    expect(store.getView().isTouchTracing).toBe(false);

    expect(() => store.toggleTouchTracing()).not.toThrow();
    store.exitDraftMode();
    store.enterDraftMode();
    expect(store.getView().isTouchTracing).toBe(true);
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

  // Un dessin posé en entier se compte une fois, qu'il parte en un lot ou en plusieurs (Écart §8.1, JOURNAL 2026-10-12)
  it("tells once that a whole draft is placed, in one batch or in several", async () => {
    const onPlaced = vi.fn();
    const { store } = setup({ onPlaced });
    fill(store, 3);
    await store.submit();
    expect(onPlaced).toHaveBeenCalledTimes(1);

    fill(store, 130);
    await store.submit();
    expect(onPlaced).toHaveBeenCalledTimes(2);
  });

  // Rien n'est compté tant que le brouillon n'est pas posé en entier : un refus, une coupure, ou rien à envoyer
  it("counts no placement while some of the draft stays: a refusal, a drop, or nothing to send", async () => {
    const onPlaced = vi.fn();
    const refused = {
      ...acceptAll([]),
      accepted: 1,
      rejected: [{ index: 1, reason: "gauge" }],
    };
    const { store } = setup({
      onPlaced,
      results: [
        { ok: true, value: refused },
        { ok: false, error: "closed" },
      ],
    });
    fill(store, 2);
    await store.submit();
    await store.submit();
    const empty = setup({ onPlaced });
    await empty.store.submit();

    expect(onPlaced).not.toHaveBeenCalled();
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

// Sur un vrai store du canvas : le gateway refuse un lot par son requestId (§6.3, dix poses par seconde au plus).
describe("createDraftStore — a lot the gateway refuses as rate_limited (§6.3)", () => {
  const gauge = { charges: 200, max: 200, nextRefillAt: now + refillMs, claimable: 0 };
  const welcome: ServerFrame = {
    t: "welcome",
    canvas: { canvasId: "canvas-1", width: 256, height: 4, ownerId: "owner-1" },
    params: {
      gaugeMaxStart: 200,
      gaugeMaxCeiling: 200,
      refillMs,
      refillCharges: 1,
      obsDelayMs: 5000,
      obsBackground: "transparent",
    },
    palette: [...PALETTE],
    version: 1,
    you: { userId: "user-1", login: "user1", displayName: "User 1", role: "viewer" },
    gauge,
  };

  // Garde tout le brouillon, rend leurs pixels, rouvre le brouillon, et n'envoie pas les lots suivants
  it("keeps the whole draft, gives the pixels back, unlocks the draft and sends no further lot", async () => {
    const sent: ClientFrame[] = [];
    const feed: { listeners?: TransportListeners } = {};
    const transport: Transport = {
      send: (frame) => {
        sent.push(frame);
      },
      listen: (listeners) => {
        feed.listeners = listeners;
      },
      close: () => undefined,
    };
    const canvas = createCanvasStore("canvas-1", transport, {
      mode: "ui",
      now: () => now,
      reload: () => undefined,
    });
    feed.listeners?.onOpen();
    feed.listeners?.onFrame(welcome);
    const store = createDraftStore(
      "canvas-1",
      canvas,
      () => ({ getItem: () => null, setItem: () => undefined }),
      { now: () => now, wait: async () => undefined },
    );
    store.enterDraftMode();
    store.startTrace();
    store.traceCells(Array.from({ length: 70 }, (_, x) => ({ x, y: 0 })));
    store.endTrace();

    const submitting = store.submit();
    const placed = sent.at(-1);
    if (placed?.t !== "place") throw new Error("aucune frame place envoyée");
    const optimistic = canvas.getView().pixels.slice(0, 64);
    expect(optimistic.every((colorIndex) => colorIndex !== 0)).toBe(true);
    feed.listeners?.onFrame({ t: "error", code: "rate_limited", requestId: placed.requestId });
    await submitting;

    expect(store.getView()).toMatchObject({ mode: "draft", isSending: false });
    expect(store.getView().draft.size).toBe(70);
    expect(canvas.getView().pixels.every((colorIndex) => colorIndex === 0)).toBe(true);
    expect(canvas.getView().gauge).toEqual(gauge);
    expect(sent.filter((frame) => frame.t === "place")).toHaveLength(1);
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

describe("createDraftStore — an archive (Écart §15, JOURNAL 2026-10-06)", () => {
  // N'entre jamais en Dessin sur une archive, quel que soit le raccourci, et n'envoie rien
  it("never enters draft mode on an archive, whatever the shortcut, and sends nothing", async () => {
    const { store, sentBatches } = setup({ view: liveView({ isArchived: true }) });

    store.enterDraftMode();
    store.toggleCell(1, 1);
    await store.submit();

    expect(store.getView()).toMatchObject({ mode: "view" });
    expect(sentBatches).toEqual([]);
  });

  // Sort du Dessin quand le canvas devient archive, garde son brouillon, et n'envoie rien
  it("leaves draft mode when the canvas turns into an archive, keeps the draft, and sends nothing", async () => {
    const { store, sentBatches, setCanvasView, cells, entries } = setup();
    store.enterDraftMode();
    store.toggleCell(1, 1);
    store.toggleCell(2, 1);

    setCanvasView(liveView({ isArchived: true }));
    store.enterDraftMode();
    await store.submit();

    expect(store.getView().mode).toBe("view");
    expect(sentBatches).toEqual([]);
    expect(cells()).toHaveLength(2);
    // Il reste rangé sous le canvas qui s'est archivé : il ne suit pas le streamer sur le nouveau.
    expect(entries.get("liveplace:draft:canvas-1:user-1")).toBeDefined();
  });

  // Reprend la main si le canvas redevient actif
  it("can enter draft mode again once the canvas is active again", () => {
    const { store, setCanvasView } = setup({ view: liveView({ isArchived: true }) });

    setCanvasView(liveView({ isArchived: false }));
    store.enterDraftMode();

    expect(store.getView().mode).toBe("draft");
  });
});

describe("createDraftStore — the recent color keys (JOURNAL 2026-10-09)", () => {
  // La touche 1 prend la dernière autre couleur utilisée, et la presser encore revient à la précédente
  it("takes the last other color with the first slot, and takes the previous one back when pressed again", () => {
    const { store } = setup();
    store.enterDraftMode();
    store.selectColor(12);
    const { recentColorIndexes } = store.getView();
    const previous = recentColorIndexes[0];

    store.selectRecentColor(0);
    expect(store.getView()).toMatchObject({ colorIndex: previous });

    store.selectRecentColor(0);
    expect(store.getView().colorIndex).toBe(12);
    expect(store.getView().recentColorIndexes).toEqual(recentColorIndexes);
  });

  // Chaque place prend sa récente et l'échange avec la couleur actuelle, sur place, comme un clic sur elle
  it("swaps the recent color of each slot with the current color in place, as a click on it does", () => {
    for (const slot of [0, 1, 2, 3, 4]) {
      const { store } = setup();
      store.enterDraftMode();
      const { colorIndex, recentColorIndexes } = store.getView();

      store.selectRecentColor(slot);

      expect(store.getView()).toMatchObject({
        colorIndex: recentColorIndexes[slot],
        recentColorIndexes: recentColorIndexes.map((index, place) => (place === slot ? colorIndex : index)),
      });
    }
  });

  // Sort de la gomme et désarme la pipette, comme un clic sur une couleur
  it("leaves the eraser and disarms the picker, as a click on a color does", () => {
    const { store } = setup();
    store.enterDraftMode();
    store.selectColor(12);
    store.toggleEraser();

    store.selectRecentColor(1);
    expect(store.getView().colorIndex).not.toBe(0);

    store.togglePicker();
    expect(store.getView().isPicking).toBe(true);
    store.selectRecentColor(2);
    expect(store.getView().isPicking).toBe(false);
  });

  // Ne fait rien en Vue
  it("does nothing in view mode", () => {
    const { store } = setup();
    const before = store.getView();

    store.selectRecentColor(0);

    expect(store.getView()).toBe(before);
  });

  // Ne fait rien pendant l'envoi, la pill est verrouillée
  it("does nothing while sending, the pill being locked", async () => {
    const { store } = setup();
    store.enterDraftMode();
    store.toggleCell(0, 0);
    const before = store.getView();

    const sending = store.submit();
    store.selectRecentColor(0);
    expect(store.getView()).toMatchObject({
      colorIndex: before.colorIndex,
      recentColorIndexes: before.recentColorIndexes,
    });
    await sending;
  });

  // Ne fait rien d'une place qui n'existe pas
  it("does nothing with a slot that does not exist", () => {
    const { store } = setup();
    store.enterDraftMode();
    const before = store.getView();

    store.selectRecentColor(5);
    store.selectRecentColor(-1);

    expect(store.getView()).toBe(before);
  });
});

describe("createDraftStore — the history (CDC 2026, §8 Historique)", () => {
  const gaugeOf = (charges: number) => ({ charges, max: 200, nextRefillAt: now + refillMs, claimable: 0 });

  // Le Dessin ouvert, avec de quoi cliquer (ligne 1) et tracer (ligne 0), et lire les colonnes du brouillon
  const drawing = (options: Setup = {}) => {
    const context = setup(options);
    context.store.enterDraftMode();
    const xs = () => context.cells().map(({ x }) => x);
    const click = (x: number) => context.store.toggleCell(x, 1);
    const trace = (...columns: number[]) => {
      context.store.startTrace();
      context.store.traceCells(columns.map((x) => ({ x, y: 0 })));
      context.store.endTrace();
    };
    return { ...context, xs, click, trace };
  };

  // Un clic qui ajoute, un clic qui retire : une étape chacun
  it("makes a click that adds, and a click that takes out, one step each", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    click(1);
    expect(xs()).toEqual([2]);

    store.undo();
    expect(xs()).toEqual([1, 2]);
    store.undo();
    expect(xs()).toEqual([1]);
    store.undo();
    expect(xs()).toEqual([]);
    store.undo();
    expect(xs()).toEqual([]);
  });

  // Un tracé entier, en plusieurs morceaux, est une seule étape
  it("makes a whole trace, in several pieces, one single step", () => {
    const { store, click, xs } = drawing();
    click(9);

    store.startTrace();
    store.traceCells([0, 1, 2].map((x) => ({ x, y: 0 })));
    store.traceCells([3, 4].map((x) => ({ x, y: 0 })));
    store.endTrace();
    expect(xs()).toEqual([9, 0, 1, 2, 3, 4]);

    store.undo();
    expect(xs()).toEqual([9]);
    store.undo();
    expect(xs()).toEqual([]);
  });

  // Un tracé qui s'arrête parce qu'on sort du Dessin est quand même une étape
  it("makes a trace that ends because draft mode is left a step all the same", () => {
    const { store, xs } = drawing();

    store.startTrace();
    store.traceCells([0, 1].map((x) => ({ x, y: 0 })));
    store.exitDraftMode();
    store.enterDraftMode();
    store.undo();

    expect(xs()).toEqual([]);
  });

  // Deux tracés sont deux étapes
  it("makes two traces two steps", () => {
    const { store, trace, xs } = drawing();
    trace(0, 1);
    trace(5, 6);

    store.undo();
    expect(xs()).toEqual([0, 1]);
    store.undo();
    expect(xs()).toEqual([]);
  });

  // Un tracé qui n'ajoute rien n'est pas une étape
  it("makes a trace that adds nothing no step", () => {
    const { store, trace, xs } = drawing();
    trace(0, 1);

    trace();
    trace(0, 1);
    store.undo();

    expect(xs()).toEqual([]);
  });

  // Retour arrière ou Suppr au clavier : une étape quand il retire une case, aucune quand la case n'y est pas
  it("makes Backspace on a cell of the draft a step, and Backspace on an absent cell none", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);

    store.discardCell(1, 1);
    store.discardCell(7, 1);
    expect(xs()).toEqual([2]);

    store.undo();
    expect(xs()).toEqual([1, 2]);
  });

  // Un coup de gomme et un tracé de gomme sont des étapes
  it("makes an eraser click and an eraser stroke steps", () => {
    const { store, click, trace, cells, xs } = drawing();
    click(1);
    store.toggleEraser();
    click(2);
    trace(3, 4);
    expect(cells().map(({ colorIndex }) => colorIndex)).toEqual([1, 0, 0, 0]);

    store.undo();
    expect(xs()).toEqual([1, 2]);
    store.undo();
    expect(xs()).toEqual([1]);
  });

  // La gomme sur un pixel transparent ne fait rien, donc n'est pas une étape
  it("makes the eraser on a transparent pixel no step", () => {
    const { store, click, xs, setCanvasView } = drawing();
    click(1);
    setCanvasView(liveView({ pixels: new Uint8Array(256 * 4) }));
    store.toggleEraser();

    click(5);
    store.undo();

    expect(xs()).toEqual([]);
  });

  // Vider est une étape, qu'on annule et qu'on rétablit ; vider un brouillon vide n'en est pas une
  it("makes Vider a step that can be undone and redone, and Vider on an empty draft none", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);

    store.discardDraft();
    expect(xs()).toEqual([]);
    store.undo();
    expect(xs()).toEqual([1, 2]);
    store.redo();
    expect(xs()).toEqual([]);

    store.discardDraft();
    store.undo();
    expect(xs()).toEqual([1, 2]);
  });

  // Changer de couleur, la gomme, la pipette, les récentes, le tracé tactile et un tracé vide ne sont pas des étapes
  it("makes colors, the eraser toggle, the picker, the recent colors, touch tracing and an empty trace no steps", () => {
    const { store, click, xs } = drawing();
    click(1);

    store.selectColor(12);
    store.toggleEraser();
    store.toggleEraser();
    store.selectRecentColor(0);
    store.togglePicker();
    store.toggleCell(3, 1);
    store.toggleTouchTracing();
    store.startTrace();
    store.endTrace();
    const { colorIndex } = store.getView();
    store.undo();

    expect(xs()).toEqual([]);
    expect(store.getView().colorIndex).toBe(colorIndex);
  });

  // Rétablir rejoue les étapes annulées, dans l'ordre, puis s'arrête
  it("redoes the undone steps in order, then stops", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    store.undo();
    store.undo();
    expect(xs()).toEqual([]);

    store.redo();
    expect(xs()).toEqual([1]);
    store.redo();
    expect(xs()).toEqual([1, 2]);
    store.redo();
    expect(xs()).toEqual([1, 2]);
  });

  // Une nouvelle étape après des annulations efface ce qui pouvait être rétabli
  it("loses what could be redone when a new step comes after undoing", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    store.undo();

    click(3);
    store.redo();

    expect(xs()).toEqual([1, 3]);
  });

  // Le brouillon sauvegardé suit l'annulation
  it("saves the draft an undo comes back to", () => {
    const { store, click, entries, cells } = drawing();
    click(1);
    click(2);

    store.undo();

    expect(JSON.parse(entries.get("liveplace:draft:canvas-1:user-1") ?? "[]")).toEqual(cells());
  });

  // Ne dépasse jamais la jauge : annuler un Vider qui rendrait plus de cases que de charges n'est pas appliqué, et la jauge vibre
  it("refuses an undo that would put more cells than charges in the draft, and shakes the gauge", () => {
    const { store, click, xs, setCanvasView } = drawing({ view: liveView({ gauge: gaugeOf(3) }) });
    click(1);
    click(2);
    click(3);
    store.discardDraft();

    setCanvasView(liveView({ gauge: gaugeOf(1) }));
    store.undo();
    expect(xs()).toEqual([]);
    expect(store.getView().shakeCount).toBe(1);

    setCanvasView(liveView({ gauge: gaugeOf(3) }));
    store.undo();
    expect(xs()).toEqual([1, 2, 3]);
    expect(store.getView().shakeCount).toBe(1);
  });

  // Rétablir non plus ne dépasse la jauge
  it("refuses a redo that would put more cells than charges in the draft, and shakes the gauge", () => {
    const { store, click, xs, setCanvasView } = drawing({ view: liveView({ gauge: gaugeOf(3) }) });
    click(1);
    click(2);
    store.undo();

    setCanvasView(liveView({ gauge: gaugeOf(1) }));
    store.redo();
    expect(xs()).toEqual([1]);
    expect(store.getView().shakeCount).toBe(1);

    setCanvasView(liveView({ gauge: gaugeOf(2) }));
    store.redo();
    expect(xs()).toEqual([1, 2]);
  });

  // Un brouillon déjà au-dessus de la jauge peut quand même se réduire en annulant
  it("lets an undo shrink a draft that is already over the gauge", () => {
    const { store, click, xs, setCanvasView } = drawing({ view: liveView({ gauge: gaugeOf(3) }) });
    click(1);
    click(2);
    click(3);

    setCanvasView(liveView({ gauge: gaugeOf(1) }));
    store.undo();

    expect(xs()).toEqual([1, 2]);
    expect(store.getView().shakeCount).toBe(0);
  });

  // Valider vide l'historique : le brouillon qui garde des pixels refusés repart sans historique
  it("empties the history on validation: a draft that keeps refused pixels starts again without history", async () => {
    const rejected = { ...acceptAll([]), accepted: 1, rejected: [{ index: 1, reason: "gauge" }] };
    const { store, click, xs } = drawing({ results: [{ ok: true, value: rejected }] });
    click(1);
    click(2);

    await store.submit();
    expect(xs()).toEqual([2]);
    store.undo();

    expect(xs()).toEqual([2]);
    expect(store.getView().mode).toBe("draft");
  });

  // Une vraie pose ne s'annule jamais : tout est posé, on revient en Vue, et en Dessin il n'y a rien à annuler ni à rétablir
  it("never undoes a real placement: after a full validation there is nothing to undo or redo", async () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    store.undo();

    await store.submit();
    store.enterDraftMode();
    store.undo();
    store.redo();

    expect(xs()).toEqual([]);
  });

  // Une validation qui ne part pas (connexion tombée) ne vide pas l'historique
  it("keeps the history when the validation does not leave", async () => {
    const { store, click, xs, setCanvasView } = drawing();
    click(1);
    click(2);
    setCanvasView(liveView({ status: "closed" }));

    await store.submit();
    store.undo();

    expect(xs()).toEqual([1]);
  });

  // Hors du Dessin rien ne bouge ; le brouillon gardé garde aussi son historique
  it("does nothing in view mode, and the draft that is kept keeps its history", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    store.exitDraftMode();

    store.undo();
    store.redo();
    expect(xs()).toEqual([1, 2]);

    store.enterDraftMode();
    store.undo();
    expect(xs()).toEqual([1]);
  });

  // Pendant l'envoi, la pill est verrouillée : ni annuler ni rétablir
  it("does nothing while sending, the pill being locked", async () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);

    const sending = store.submit();
    store.undo();
    store.redo();
    expect(xs()).toEqual([1, 2]);
    await sending;
  });

  // Pendant un tracé, rien n'est annulé : il n'est pas encore une étape finie
  it("does nothing during a trace, which is not a finished step yet", () => {
    const { store, click, xs } = drawing();
    click(1);

    store.startTrace();
    store.traceCells([{ x: 0, y: 0 }]);
    store.undo();
    expect(xs()).toEqual([1, 0]);

    store.endTrace();
    store.undo();
    expect(xs()).toEqual([1]);
  });

  // L'historique vit en mémoire : seul le brouillon est sauvegardé, et une page rechargée repart sans historique
  it("keeps the history in memory only: a reloaded page starts without history", () => {
    const first = drawing();
    first.click(1);
    first.click(2);
    first.store.undo();
    expect([...first.entries.keys()]).toEqual(["liveplace:draft:canvas-1:user-1"]);

    const reloaded = setup({ saved: JSON.stringify([{ x: 1, y: 1, colorIndex: 4 }]) });
    reloaded.store.enterDraftMode();
    reloaded.store.undo();

    expect(reloaded.cells()).toEqual([{ x: 1, y: 1, colorIndex: 4 }]);
  });

  // Un canvas qui rétrécit fait sortir des cases du brouillon : annuler ne les ramène pas
  it("does not bring back cells that left the draft when the canvas shrank", () => {
    const { store, click, xs, setCanvasView } = drawing();
    click(200);
    click(1);

    setCanvasView(liveView({ width: 100 }));
    expect(xs()).toEqual([1]);
    store.undo();

    expect(xs()).toEqual([]);
  });
});

describe("createDraftStore — taking a cleared draft back (Écart §9.3, JOURNAL 2026-10-13)", () => {
  const drawing = () => {
    const context = setup();
    context.store.enterDraftMode();
    const xs = () => context.cells().map(({ x }) => x);
    const click = (x: number) => context.store.toggleCell(x, 1);
    return { ...context, xs, click };
  };

  // Vider rend le brouillon qu'il vient de vider, de quoi le rétablir ; vider un brouillon vide ne rend rien
  it("hands back the draft it just cleared, and nothing when the draft was already empty", () => {
    const { store, click } = drawing();
    click(1);
    click(2);

    expect(store.discardDraft()?.size).toBe(2);
    expect(store.discardDraft()).toBeUndefined();
  });

  // Le rétablir remet ce brouillon : c'est l'étape que Vider avait prise, que Ctrl+Maj+Z fait refaire
  it("brings the cleared draft back as the step Vider took, which a redo clears again", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    const cleared = store.discardDraft();

    if (cleared) store.restoreDraft(cleared);
    expect(xs()).toEqual([1, 2]);

    store.redo();
    expect(xs()).toEqual([]);
  });

  // Dessiné depuis, le rétablir n'écrase rien : le brouillon d'aujourd'hui reste
  it("leaves the draft alone once something was drawn after Vider", () => {
    const { store, click, xs } = drawing();
    click(1);
    click(2);
    const cleared = store.discardDraft();
    click(5);

    if (cleared) store.restoreDraft(cleared);

    expect(xs()).toEqual([5]);
  });

  // Sorti du Dessin, le rétablir ne touche pas au brouillon gardé
  it("does nothing once the Draw mode is closed", () => {
    const { store, click, xs } = drawing();
    click(1);
    const cleared = store.discardDraft();
    store.exitDraftMode();

    if (cleared) store.restoreDraft(cleared);

    expect(xs()).toEqual([]);
  });
});

describe("createDraftStore — pixels moved by a resize (Écart §5.3, JOURNAL 2026-10-24)", () => {
  const key = "liveplace:draft:canvas-1:user-1";

  const drawing = (view = liveView()) => {
    const context = setup({ view });
    context.store.enterDraftMode();
    context.store.toggleCell(1, 1);
    context.store.toggleCell(2, 1);
    const wiped = vi.fn();
    context.store.listenWiped(wiped);
    return { ...context, wiped };
  };

  // Efface le brouillon d'un welcome qui dit que des pixels ont bougé : en mémoire, dans le stockage, et dans Annuler
  it("wipes the draft when the canvas says pixels moved: in memory, in browser storage, and from Annuler", () => {
    const { store, cells, entries, setCanvasView } = drawing();
    expect(cells()).toHaveLength(2);

    setCanvasView(liveView({ movedAtVersion: 12 }));

    expect(cells()).toEqual([]);
    expect(JSON.parse(entries.get(key) ?? "null")).toEqual({ movedAtVersion: 12, pixels: [] });
    store.undo();
    expect(cells()).toEqual([]);
    store.redo();
    expect(cells()).toEqual([]);
    expect(store.getView().mode).toBe("draft");
  });

  // Le dit une seule fois à qui écoute, et seulement quand le brouillon n'était pas vide
  it("tells its listeners once, and only when the draft was not empty", () => {
    const { wiped, setCanvasView, store } = drawing();

    setCanvasView(liveView({ movedAtVersion: 12 }));
    setCanvasView(liveView({ movedAtVersion: 12, version: 2 }));
    expect(wiped).toHaveBeenCalledTimes(1);

    setCanvasView(liveView({ movedAtVersion: 20 }));
    expect(wiped).toHaveBeenCalledTimes(1);
    expect(store.getView().draft.size).toBe(0);
  });

  // Ne propose pas de rétablir ce qui vient d'être effacé : Vider d'avant ne ramène rien non plus
  it("offers nothing to take back once pixels moved, not even what Vider had cleared before", () => {
    const { store, cells, setCanvasView } = drawing();
    const cleared = store.discardDraft();

    setCanvasView(liveView({ movedAtVersion: 12 }));
    if (cleared) store.restoreDraft(cleared);

    expect(cells()).toEqual([]);
  });

  // Une réduction qui ne déplace rien garde le comportement d'avant : seules les cases hors du cadre quittent le brouillon
  it("keeps the old behavior for a shrink that moved nothing: only the cells outside the frame leave", () => {
    const { store, cells, wiped, setCanvasView } = drawing();
    store.toggleCell(5, 1);

    setCanvasView(liveView({ width: 3 }));

    expect(cells().map(({ x }) => x)).toEqual([1, 2]);
    expect(wiped).not.toHaveBeenCalled();
  });

  // Le brouillon d'après se sauvegarde sous la nouvelle version, et revient sous elle
  it("saves the next draft under the new version, and reads it back under it", () => {
    const { store, entries, setCanvasView } = drawing();
    setCanvasView(liveView({ movedAtVersion: 12 }));

    store.toggleCell(3, 1);

    expect(JSON.parse(entries.get(key) ?? "null")).toEqual({
      movedAtVersion: 12,
      pixels: [{ x: 3, y: 1, colorIndex: store.getView().colorIndex }],
    });
    const reloaded = setup({ view: liveView({ movedAtVersion: 12 }), entries });
    expect(reloaded.cells().map(({ x }) => x)).toEqual([3]);
  });

  // Un brouillon sauvegardé avant un rapprochement, rechargé après, est jeté, dit à qui écoute, et effacé du stockage
  it("throws away a draft saved before a move and reloaded after it, tells its listeners, and erases the save", () => {
    const { entries } = drawing();
    const wiped = vi.fn();
    const reloaded = setup({ view: guestView({ status: "connecting", role: "viewer" }), entries });
    reloaded.store.listenWiped(wiped);

    reloaded.setCanvasView(liveView({ movedAtVersion: 12 }));

    expect(reloaded.cells()).toEqual([]);
    expect(wiped).toHaveBeenCalledTimes(1);
    expect(JSON.parse(entries.get(key) ?? "null")).toEqual({ movedAtVersion: 12, pixels: [] });
    const again = setup({ view: liveView({ movedAtVersion: 12 }), entries });
    expect(again.cells()).toEqual([]);
  });

  // Un brouillon sauvegardé sous la version que le canvas connaît revient, sans rien dire
  it("brings back a draft saved under the version the canvas knows, saying nothing", () => {
    const { store, entries, setCanvasView } = drawing();
    setCanvasView(liveView({ movedAtVersion: 12 }));
    store.toggleCell(3, 1);
    const wiped = vi.fn();
    const reloaded = setup({ view: guestView({ status: "connecting", role: "viewer" }), entries });
    reloaded.store.listenWiped(wiped);

    reloaded.setCanvasView(liveView({ movedAtVersion: 12 }));

    expect(reloaded.cells().map(({ x }) => x)).toEqual([3]);
    expect(wiped).not.toHaveBeenCalled();
  });

  // Un envoi en cours quand des pixels bougent ne compte pas comme une pose : rien n'a été posé
  it("does not count a send cut short by a move as a placement", async () => {
    const onPlaced = vi.fn();
    const move: { run?: () => void } = {};
    const { store, setCanvasView } = setup({
      onPlaced,
      results: [{ ok: false, error: "closed" }],
      onPlace: () => move.run?.(),
    });
    move.run = () => setCanvasView(liveView({ movedAtVersion: 12 }));
    store.enterDraftMode();
    store.toggleCell(1, 1);

    await store.submit();

    expect(onPlaced).not.toHaveBeenCalled();
    expect(store.getView().draft.size).toBe(0);
    expect(store.getView().isSending).toBe(false);
    expect(store.getView().mode).toBe("draft");
  });

  // Stoppe d'écouter quand on le demande
  it("stops telling a listener that left", () => {
    const { store, setCanvasView } = drawing();
    const left = vi.fn();
    const leave = store.listenWiped(left);
    leave();

    setCanvasView(liveView({ movedAtVersion: 12 }));

    expect(left).not.toHaveBeenCalled();
  });
});
