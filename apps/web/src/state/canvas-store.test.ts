import { PALETTE, toStateOffset } from "@liveplace/domain";
import type { AckFrame, Transport, TransportListeners } from "@liveplace/domain/ports";
import type { ClientFrame, ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createCanvasStore } from "./canvas-store";

const width = 4;
const now = 1_700_000_000_000;
const gauge = { charges: 3, max: 10, nextRefillAt: now + 10_000 };

const welcome: ServerFrame = {
  t: "welcome",
  canvas: { canvasId: "canvas-1", width, height: 4, ownerId: "owner-1" },
  params: { gaugeMax: 10, refillMs: 10_000, refillCharges: 1, obsDelayMs: 5000 },
  palette: [...PALETTE],
  version: 7,
  you: { userId: "user-1", login: "user1", displayName: "User 1", role: "viewer" },
  gauge,
};

type PlaceFrame = Extract<ClientFrame, { t: "place" }>;

const setup = () => {
  const sent: ClientFrame[] = [];
  const listening: { listeners?: TransportListeners } = {};
  const transport: Transport = {
    send: (frame) => {
      sent.push(frame);
    },
    listen: (listeners) => {
      listening.listeners = listeners;
    },
    close: () => undefined,
  };
  const store = createCanvasStore("canvas-1", transport);
  const receive = (frame: ServerFrame) => listening.listeners?.onFrame(frame);
  receive(welcome);
  const lastPlace = (): PlaceFrame => {
    const frame = sent.at(-1);
    if (frame?.t !== "place") throw new Error("aucune frame place envoyée");
    return frame;
  };
  const ackOf = (frame: PlaceFrame, rejectedIndexes: number[] = []): AckFrame => ({
    t: "ack",
    requestId: frame.requestId,
    accepted: frame.pixels.length - rejectedIndexes.length,
    rejected: rejectedIndexes.map((index) => ({ index, reason: "gauge" })),
    gauge: { ...gauge, charges: 1 },
  });
  const pixelAt = (x: number, y: number) => store.getView().pixels[toStateOffset(x, y, width)];
  const close = () => listening.listeners?.onClose(1006);
  return { store, sent, receive, lastPlace, ackOf, pixelAt, close };
};

const cellsFrame = (x: number, y: number, colorIndex: number): ServerFrame => ({
  t: "cells",
  toVersion: 8,
  cells: [{ x, y, colorIndex, previousColorIndex: 0, placedAt: now, version: 8, kind: "place" }],
});

describe("the gauge (§9.4)", () => {
  // Prend la jauge et l'identité dans le welcome
  it("takes the gauge and the identity from the welcome", () => {
    const { store } = setup();

    expect(store.getView()).toMatchObject({ gauge, userId: "user-1", params: welcome.params });
  });

  // Prend la jauge de chaque ack et de chaque frame gauge
  it("takes the gauge from every ack and every gauge frame", () => {
    const { store, receive } = setup();

    receive({ t: "ack", requestId: "other", accepted: 1, rejected: [], gauge: { ...gauge, charges: 2 } });
    expect(store.getView().gauge?.charges).toBe(2);

    receive({ t: "gauge", ...gauge, charges: 5 });
    expect(store.getView().gauge?.charges).toBe(5);
  });

  // Efface le dernier refus à chaque ack
  it("clears the last refusal on every ack", () => {
    const { store, receive } = setup();
    receive({ t: "error", code: "rate_limited" });

    receive({ t: "ack", requestId: "other", accepted: 1, rejected: [], gauge });

    expect(store.getView().lastError).toBeNull();
  });
});

describe("placeBatch (§9.2, §9.3)", () => {
  // Écrit les pixels tout de suite, avant la réponse, et les envoie dans une seule frame
  it("writes the pixels at once, before the answer, and sends them in one frame", () => {
    const { store, lastPlace, pixelAt } = setup();

    void store.placeBatch([
      { x: 1, y: 2, colorIndex: 5 },
      { x: 2, y: 2, colorIndex: 6 },
    ]);

    expect(pixelAt(1, 2)).toBe(5);
    expect(pixelAt(2, 2)).toBe(6);
    expect(lastPlace().pixels).toHaveLength(2);
  });

  // Se résout sur l'ack du même requestId, jamais sur celui d'un autre
  it("resolves on the ack of the same requestId, never on another one", async () => {
    const { store, receive, lastPlace, ackOf } = setup();
    let settled = false;
    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }]).then((result) => {
      settled = true;
      return result;
    });

    receive({ ...ackOf(lastPlace()), requestId: "other" });
    await Promise.resolve();
    expect(settled).toBe(false);

    const ack = ackOf(lastPlace());
    receive(ack);
    expect(await placing).toEqual({ ok: true, value: ack });
  });

  // Rend sa couleur d'avant à un pixel refusé, et garde l'accepté
  it("gives a rejected pixel its previous color back, and keeps the accepted one", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();
    receive(cellsFrame(2, 2, 9));

    const placing = store.placeBatch([
      { x: 1, y: 2, colorIndex: 5 },
      { x: 2, y: 2, colorIndex: 6 },
    ]);
    receive(ackOf(lastPlace(), [1]));
    await placing;

    expect(pixelAt(1, 2)).toBe(5);
    expect(pixelAt(2, 2)).toBe(9);
  });

  // Laisse à une frame cells passée entre-temps le dernier mot sur un pixel refusé
  it("lets a cells frame that came in between have the last word on a rejected pixel", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }]);
    receive(cellsFrame(1, 2, 12));
    receive(ackOf(lastPlace(), [0]));
    await placing;

    expect(pixelAt(1, 2)).toBe(12);
  });

  // Garde un pixel accepté quand l'ack arrive avant sa frame cells, puis prend la frame
  it("keeps an accepted pixel when the ack comes before its cells frame, then takes the frame", async () => {
    const { store, receive, lastPlace, ackOf, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }]);
    receive(ackOf(lastPlace()));
    await placing;
    expect(pixelAt(1, 2)).toBe(5);

    receive(cellsFrame(1, 2, 5));
    expect(pixelAt(1, 2)).toBe(5);
    expect(store.getView().version).toBe(8);
  });

  // Se résout sur le code d'erreur que le gateway envoie à la place de l'ack, et rend les couleurs d'avant
  it("resolves with the error code the gateway sends instead of an ack, and restores the colors", async () => {
    const { store, receive, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }]);
    receive({ t: "error", code: "unauthenticated" });

    expect(await placing).toEqual({ ok: false, error: "unauthenticated" });
    expect(pixelAt(1, 2)).toBe(0);
  });

  // Se résout en « fermé » quand la connexion tombe pendant l'envoi, et rend les couleurs d'avant
  it("resolves as closed when the connection drops while sending, and restores the colors", async () => {
    const { store, close, pixelAt } = setup();

    const placing = store.placeBatch([{ x: 1, y: 2, colorIndex: 5 }]);
    close();

    expect(await placing).toEqual({ ok: false, error: "closed" });
    expect(pixelAt(1, 2)).toBe(0);
    expect(store.getView().status).toBe("closed");
  });
});
