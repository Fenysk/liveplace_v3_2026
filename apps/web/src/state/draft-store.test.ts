import { PALETTE, toCellKey } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { CanvasStore, CanvasView, Pixel, PlaceResult } from "./canvas-store";
import { createDraftStore, type DraftClock } from "./draft-store";
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
  params: { gaugeMax: 200, refillMs, refillCharges: 1, obsDelayMs: 5000 },
  gauge: null,
  lastError: null,
  inspection: null,
  pixels: new Uint8Array(256 * 4).fill(9),
  ...overrides,
});

const liveView = (overrides: Partial<CanvasView> = {}): CanvasView =>
  guestView({
    role: "viewer",
    userId: "user-1",
    displayName: "User 1",
    gauge: { charges: 200, max: 200, nextRefillAt: now + refillMs },
    ...overrides,
  });

type Setup = { view?: CanvasView; results?: PlaceResult[]; saved?: string };

const setup = ({ view = liveView(), results = [], saved }: Setup = {}) => {
  let canvasView = view;
  const canvasListeners = new Set<() => void>();
  const sentBatches: Pixel[][] = [];
  const canvas: CanvasStore = {
    subscribe: (listener) => {
      canvasListeners.add(listener);
      return () => canvasListeners.delete(listener);
    },
    getView: () => canvasView,
    placeBatch: async (pixels) => {
      sentBatches.push([...pixels]);
      const accepted = { ok: true as const, value: acceptAll(pixels) };
      return results.shift() ?? accepted;
    },
    inspect: () => undefined,
    closeInspection: () => undefined,
    close: () => undefined,
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
  return { store, sentBatches, entries, clock, setCanvasView, cells };
};

const acceptAll = (pixels: readonly Pixel[]) => ({
  t: "ack" as const,
  requestId: "request",
  accepted: pixels.length,
  rejected: [],
  gauge: { charges: 0, max: 200, nextRefillAt: now + refillMs },
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

  // Quand un invité veut dessiner, la pill Dessin l'invite à se connecter ; Annuler referme l'invitation (CDC 2026)
  it("invites a guest to sign in instead of entering draft mode, and cancel closes the invitation", () => {
    const { store } = setup({ view: guestView() });

    store.enterDraftMode();
    expect(store.getView().isSignInPrompted).toBe(true);

    store.exitDraftMode();
    expect(store.getView().isSignInPrompted).toBe(false);
    expect(store.getView().mode).toBe("view");
  });

  // Un compte connecté entre en Dessin sans invitation, et rien n'invite avant le `welcome`
  it("never invites a signed-in user, nor anyone before the welcome", () => {
    const signedIn = setup();
    signedIn.store.enterDraftMode();
    expect(signedIn.store.getView()).toMatchObject({ mode: "draft", isSignInPrompted: false });

    const connecting = setup({ view: guestView({ status: "connecting" }) });
    connecting.store.enterDraftMode();
    expect(connecting.store.getView().isSignInPrompted).toBe(false);
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
      view: liveView({ gauge: { charges: 0, max: 200, nextRefillAt: now } }),
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
      view: liveView({ gauge: { charges: 2, max: 200, nextRefillAt: now + refillMs } }),
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
