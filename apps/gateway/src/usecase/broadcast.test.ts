import type { CanvasCore, LiveMessage } from "@liveplace/domain/ports";
import type { CellsFrame, Event } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { type CellsListener, createBroadcast } from "./broadcast";

const occurredAt = 1_700_000_000_000;

const event = (version: number, x: number, colorIndex: number): Event => ({
  version,
  kind: "place",
  authorId: "user-1",
  occurredAt,
  cells: [{ x, y: 2, colorIndex, previousColorIndex: 0, placedAt: occurredAt }],
});

// Le noyau vu par la diffusion : un abonnement, et de quoi publier à la main.
const fakeCore = () => {
  const callbacks = new Map<string, (message: LiveMessage) => void>();
  const counts = { subscribe: 0, unsubscribe: 0 };
  const core: Pick<CanvasCore, "subscribe"> = {
    async subscribe(canvasId, onMessage) {
      counts.subscribe += 1;
      callbacks.set(canvasId, onMessage);
      return async () => {
        counts.unsubscribe += 1;
        callbacks.delete(canvasId);
      };
    },
  };
  const publish = (canvasId: string, published: Event) => callbacks.get(canvasId)?.({ e: published });
  return { core, counts, publish };
};

describe("createBroadcast (§6.2, §6.3)", () => {
  // N'ouvre qu'un abonnement pour deux clients d'un canvas, et ne le ferme qu'au départ du dernier
  it("subscribes once for two clients of a canvas, and unsubscribes when the last one leaves", async () => {
    const { core, counts } = fakeCore();
    const broadcast = createBroadcast(core);
    const seen: CellsFrame[] = [];
    const first: CellsListener = (frame) => {
      seen.push(frame);
    };
    const second: CellsListener = (frame) => {
      seen.push(frame);
    };

    await broadcast.join("canvas-1", first);
    await broadcast.join("canvas-1", second);

    expect(counts.subscribe).toBe(1);

    await broadcast.leave("canvas-1", first);

    expect(counts.unsubscribe).toBe(0);

    await broadcast.leave("canvas-1", second);

    expect(counts.unsubscribe).toBe(1);
  });

  // Envoie au tick une seule frame conflatée, la même pour tous les clients du canvas
  it("sends one conflated frame per tick, the same for every client of the canvas", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const first: CellsFrame[] = [];
    const second: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => first.push(frame));
    await broadcast.join("canvas-1", (frame) => second.push(frame));

    publish("canvas-1", event(1, 3, 5));
    publish("canvas-1", event(2, 3, 6));
    broadcast.tick();

    expect(first).toHaveLength(1);
    expect(first[0]?.toVersion).toBe(2);
    expect(first[0]?.cells).toHaveLength(1);
    expect(second).toEqual(first);
  });

  // N'envoie rien quand rien n'a été publié, et vide son tampon d'un tick à l'autre
  it("sends nothing without a publication, and empties its buffer between two ticks", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const received: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => received.push(frame));

    broadcast.tick();

    expect(received).toHaveLength(0);

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();
    broadcast.tick();

    expect(received).toHaveLength(1);
  });

  // Ne mélange jamais deux canvas
  it("never mixes two canvases", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const firstCanvas: CellsFrame[] = [];
    const secondCanvas: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => firstCanvas.push(frame));
    await broadcast.join("canvas-2", (frame) => secondCanvas.push(frame));

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();

    expect(firstCanvas).toHaveLength(1);
    expect(secondCanvas).toHaveLength(0);
  });
});
