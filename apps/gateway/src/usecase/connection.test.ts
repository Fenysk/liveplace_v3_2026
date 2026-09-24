import type { CanvasMeta, Session } from "@liveplace/domain";
import type { AckFrame, ClientSocket, InspectEntry, LiveMessage, Placement } from "@liveplace/domain/ports";
import { type Event, PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createBroadcast } from "./broadcast";
import { createConnection } from "./connection";

const canvasId = "canvas-1";
const now = 1_700_000_000_000;

const meta: CanvasMeta = {
  ownerId: "owner-1",
  width: 4,
  height: 4,
  gaugeMax: 3,
  refillMs: 1000,
  refillCharges: 1,
  obsDelayMs: 5000,
};

const session: Session = { userId: "user-1", login: "user1", displayName: "User 1" };

const ack: AckFrame = {
  t: "ack",
  requestId: "request-1",
  version: 3,
  accepted: 1,
  rejected: [],
  gauge: { charges: 2, max: meta.gaugeMax, nextRefillAt: now + meta.refillMs },
};

const entry: InspectEntry = {
  userId: "user-2",
  login: "user2",
  displayName: "User 2",
  colorIndex: 3,
  placedAt: now,
};

const inspect = (x: number, y: number) => JSON.stringify({ t: "inspect", requestId: "inspect-1", x, y });

const hello = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode: "ui", ...overrides });

const place = () =>
  JSON.stringify({ t: "place", requestId: ack.requestId, pixels: [{ x: 1, y: 2, colorIndex: 3 }] });

const event = (version: number, x: number, colorIndex: number): Event => ({
  version,
  kind: "place",
  authorId: "user-2",
  occurredAt: now,
  cells: [{ x, y: 2, colorIndex, previousColorIndex: 0, placedAt: now }],
});

type SetupOptions = { session?: Session | null; version?: number; duringSnapshot?: () => void };

const setup = (options: SetupOptions = {}) => {
  const placements: Placement[] = [];
  const inspected: { x: number; y: number }[] = [];
  let publishTo: ((message: LiveMessage) => void) | null = null;
  const core = {
    async getCanvas(asked: string) {
      return asked === canvasId ? meta : null;
    },
    async isModerator() {
      return false;
    },
    async getSnapshot() {
      options.duringSnapshot?.();
      return { state: new Uint8Array(meta.width * meta.height), version: options.version ?? 0 };
    },
    async getGauge(_asked: string, _userId: string, nowMs: number) {
      return { ...ack.gauge, nextRefillAt: nowMs + meta.refillMs };
    },
    async inspect(_asked: string, x: number, y: number) {
      inspected.push({ x, y });
      return x === 1 && y === 2 ? entry : null;
    },
    async place(_asked: string, placement: Placement) {
      placements.push(placement);
      return { ok: true as const, value: ack };
    },
    async subscribe(_asked: string, onMessage: (message: LiveMessage) => void) {
      publishTo = onMessage;
      return async () => {
        publishTo = null;
      };
    },
  };

  const sent: (ServerFrame | { snapshot: Uint8Array })[] = [];
  const closed: number[] = [];
  const socket: ClientSocket = {
    sendFrame: (frame) => {
      sent.push(frame);
    },
    sendSnapshot: (state) => {
      sent.push({ snapshot: state });
    },
    close: (code) => {
      closed.push(code);
    },
  };

  const broadcast = createBroadcast(core);
  const connection = createConnection(
    { core, broadcast, now: () => now },
    socket,
    options.session === undefined ? session : options.session,
  );
  return {
    connection,
    broadcast,
    sent,
    closed,
    placements,
    inspected,
    publish: (published: Event) => publishTo?.({ e: published }),
  };
};

describe("createConnection (§6.1)", () => {
  // Répond au hello par un welcome puis le snapshot binaire
  it("answers hello with a welcome, then the binary snapshot", async () => {
    const { connection, sent } = setup();

    await connection.receive(hello());

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      t: "welcome",
      canvas: { canvasId, width: meta.width, height: meta.height, ownerId: meta.ownerId },
      params: { gaugeMax: meta.gaugeMax, obsDelayMs: meta.obsDelayMs },
      version: 0,
      you: { userId: session.userId, login: session.login, role: "viewer" },
    });
    expect(sent[1]).toEqual({ snapshot: new Uint8Array(meta.width * meta.height) });
  });

  // Joint au welcome d'un connecté sa jauge, lue à l'heure injectée (JOURNAL 2026-09-24)
  it("joins the gauge, read at the injected clock, to a signed-in welcome", async () => {
    const { connection, sent } = setup();

    await connection.receive(hello());

    expect(sent[0]).toMatchObject({
      t: "welcome",
      gauge: { ...ack.gauge, nextRefillAt: now + meta.refillMs },
    });
  });

  // N'envoie aucune jauge à un invité
  it("sends no gauge to a guest", async () => {
    const { connection, sent } = setup({ session: null });

    await connection.receive(hello());

    expect(sent[0]).toMatchObject({ t: "welcome", you: { role: "guest" } });
    expect(sent[0]).not.toHaveProperty("gauge");
  });

  // Refuse une autre version de protocole, avec le bon code (§4.1)
  it("refuses another protocol version with the right code", async () => {
    const { connection, sent, closed } = setup();

    await connection.receive(hello({ protocolVersion: PROTOCOL_VERSION + 1 }));

    expect(sent).toEqual([{ t: "error", code: "protocol_version" }]);
    expect(closed).toEqual([1008]);
  });

  // Refuse un canvas absent ou pas prêt (§5.5)
  it("refuses a missing or not ready canvas", async () => {
    const { connection, sent, closed } = setup();

    await connection.receive(hello({ canvasId: "unknown-canvas" }));

    expect(sent).toEqual([{ t: "error", code: "canvas_not_found" }]);
    expect(closed).toEqual([1008]);
  });

  // Refuse la pose d'un invité sans jamais appeler le noyau, et le laisse regarder
  it("refuses a placement from a guest without calling the core, and keeps it connected", async () => {
    const { connection, sent, closed, placements } = setup({ session: null });
    await connection.receive(hello());

    await connection.receive(place());

    expect(sent.at(-1)).toEqual({ t: "error", code: "unauthenticated" });
    expect(placements).toEqual([]);
    expect(closed).toEqual([]);
  });

  // Transmet la pose au noyau avec l'horloge injectée, et renvoie l'ack tel quel
  it("forwards a placement with the injected clock and returns the ack as is", async () => {
    const { connection, sent, placements } = setup();
    await connection.receive(hello());

    await connection.receive(place());

    expect(placements).toEqual([
      {
        userId: session.userId,
        requestId: ack.requestId,
        nowMs: now,
        pixels: [{ x: 1, y: 2, colorIndex: 3 }],
      },
    ]);
    expect(sent.at(-1)).toEqual(ack);
  });

  // Ferme sur un JSON cassé
  it("closes on broken JSON", async () => {
    const { connection, sent, closed } = setup();

    await connection.receive("{ pas du json");

    expect(sent).toEqual([{ t: "error", code: "invalid_frame" }]);
    expect(closed).toEqual([1008]);
  });

  // Ferme sur une pose reçue avant le hello
  it("closes on a placement received before hello", async () => {
    const { connection, closed, placements } = setup();

    await connection.receive(place());

    expect(placements).toEqual([]);
    expect(closed).toEqual([1008]);
  });

  // Ferme sur une frame que le protocole ne définit pas
  it("closes on a frame the protocol does not define", async () => {
    const { connection, closed } = setup();

    await connection.receive(JSON.stringify({ t: "whatever" }));

    expect(closed).toEqual([1008]);
  });

  // Répond à une inspection par l'auteur du pixel, invité compris (JOURNAL 2026-09-24)
  it("answers an inspection with the pixel's author, for a guest too", async () => {
    const { connection, sent } = setup({ session: null });
    await connection.receive(hello());

    await connection.receive(inspect(1, 2));

    expect(sent.at(-1)).toEqual({ t: "inspected", requestId: "inspect-1", x: 1, y: 2, entry });
  });

  // Répond sans entrée pour une case où personne n'a posé
  it("answers without an entry for a cell nobody placed on", async () => {
    const { connection, sent } = setup();
    await connection.receive(hello());

    await connection.receive(inspect(0, 0));

    expect(sent.at(-1)).toEqual({ t: "inspected", requestId: "inspect-1", x: 0, y: 0 });
  });

  // Répond sans entrée hors du canvas, sans interroger le noyau : une cellKey hors bornes nommerait une autre case
  it("answers without an entry outside the canvas, without asking the core", async () => {
    const { connection, sent, inspected } = setup();
    await connection.receive(hello());

    await connection.receive(inspect(meta.width, 0));

    expect(sent.at(-1)).toEqual({ t: "inspected", requestId: "inspect-1", x: meta.width, y: 0 });
    expect(inspected).toEqual([]);
  });

  // Répond pong à un ping
  it("answers a ping with a pong", async () => {
    const { connection, sent } = setup();
    await connection.receive(hello());

    await connection.receive(JSON.stringify({ t: "ping" }));

    expect(sent.at(-1)).toEqual({ t: "pong" });
  });

  // Garde ce qui arrive pendant la lecture de l'état, et jette ce que le snapshot contient déjà
  it("holds what arrives during the state read, and drops what the snapshot already holds", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ version: 1, duringSnapshot: () => during.run?.() });
    during.run = () => {
      context.publish(event(1, 1, 5));
      context.publish(event(2, 2, 6));
      context.broadcast.tick();
    };

    await context.connection.receive(hello());

    expect(context.sent).toHaveLength(3);
    expect(context.sent[2]).toEqual({
      t: "cells",
      toVersion: 2,
      cells: [{ x: 2, y: 2, colorIndex: 6, previousColorIndex: 0, placedAt: now, version: 2, kind: "place" }],
    });
  });

  // Traite les frames une par une : une pose envoyée juste après le hello attend le welcome
  it("handles frames one at a time: a placement sent right after hello waits for the welcome", async () => {
    const { connection, sent } = setup();

    const greeted = connection.receive(hello());
    const placed = connection.receive(place());
    await Promise.all([greeted, placed]);

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "ack",
    ]);
  });

  // Quitte la diffusion à la fermeture : plus aucune case n'arrive
  it("leaves the broadcast on close: no cell arrives afterwards", async () => {
    const context = setup();
    await context.connection.receive(hello());

    await context.connection.close();
    context.publish(event(1, 1, 5));
    context.broadcast.tick();

    expect(context.sent).toHaveLength(2);
  });
});
