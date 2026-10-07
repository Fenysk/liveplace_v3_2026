import { PALETTE } from "@liveplace/domain";
import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createCanvasStore } from "../../state/canvas-store";
import { CANVAS_TEXTS } from "./canvas-texts";
import { connectionToast } from "./connection-toast";

const CONNECTION_LOST_TOAST = CANVAS_TEXTS.fr.connectionLost;
const RECONNECTED_TOAST = CANVAS_TEXTS.fr.reconnected;

const welcome: ServerFrame = {
  t: "welcome",
  canvas: { canvasId: "canvas-1", width: 4, height: 4, ownerId: "owner-1" },
  params: {
    gaugeMaxStart: 10,
    gaugeMaxCeiling: 150,
    refillMs: 10_000,
    refillCharges: 1,
    obsDelayMs: 5000,
    obsBackground: "transparent",
  },
  palette: [...PALETTE],
  version: 7,
  you: { role: "guest" },
};

// Un vrai store sur un transport factice, et la règle du toast qui l'écoute comme le fait la page.
const setup = () => {
  const listening: { listeners?: TransportListeners } = {};
  const transport: Transport = {
    send: () => undefined,
    listen: (listeners) => {
      listening.listeners = listeners;
    },
    close: () => undefined,
  };
  const store = createCanvasStore("canvas-1", transport, {
    mode: "ui",
    now: () => 0,
    reload: () => undefined,
  });
  listening.listeners?.onOpen();
  listening.listeners?.onFrame(welcome);
  const toasts: { tone: string; text: string }[] = [];
  let seen = store.getView();
  store.subscribe(() => {
    const next = store.getView();
    const toast = connectionToast(seen, next, "fr");
    if (toast) toasts.push(toast);
    seen = next;
  });
  return {
    store,
    toasts,
    dropSocket: () => listening.listeners?.onClose(1006),
    open: () => listening.listeners?.onOpen(),
    receive: (frame: ServerFrame) => listening.listeners?.onFrame(frame),
  };
};

describe("connectionToast (CDC 2026, Toasts)", () => {
  // Dit la connexion perdue, puis revenue ; rien pour les autres passages
  it("says the connection lost, then back, and nothing for the other changes", () => {
    expect(connectionToast({ status: "live" }, { status: "reconnecting" }, "fr")).toEqual({
      tone: "error",
      text: CONNECTION_LOST_TOAST,
    });
    expect(connectionToast({ status: "reconnecting" }, { status: "live" }, "fr")).toEqual({
      tone: "success",
      text: RECONNECTED_TOAST,
    });
    expect(connectionToast({ status: "connecting" }, { status: "live" }, "fr")).toBeNull();
    expect(connectionToast({ status: "live" }, { status: "live" }, "fr")).toBeNull();
    expect(connectionToast({ status: "live" }, { status: "closed" }, "fr")).toBeNull();
    expect(connectionToast({ status: "live" }, { status: "reconnecting" }, "en")?.text).toBe(
      "Connection lost: the page is reconnecting.",
    );
    expect(connectionToast({ status: "reconnecting" }, { status: "live" }, "en")?.text).toBe("Reconnected");
  });
});

describe("the connection toast on a real store (Écart §15, JOURNAL 2026-10-06)", () => {
  // Une coupure vraie se dit, puis la reprise aussi : la page se reconnecte d'elle-même
  it("still says a real drop, then the return, as the page reconnects by itself", () => {
    const { toasts, dropSocket, open, receive } = setup();

    dropSocket();
    open();
    receive(welcome);

    expect(toasts).toEqual([
      { tone: "error", text: CONNECTION_LOST_TOAST },
      { tone: "success", text: RECONNECTED_TOAST },
    ]);
  });

  // Une page qui change de canvas ferme son store : le socket qui tombe ensuite ne se dit pas, rien ne reprendra
  it("says nothing when the page closed its own store, as the socket that drops after is no drop", () => {
    const { store, toasts, dropSocket } = setup();

    store.close();
    dropSocket();

    expect(toasts).toEqual([]);
  });
});
