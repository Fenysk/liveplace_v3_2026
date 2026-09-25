import type { CanvasMeta, Session } from "@liveplace/domain";
import type {
  AckFrame,
  BannedUser,
  ClientSocket,
  InspectEntry,
  LiveControl,
  LiveMessage,
  Moderation,
  ModerationSlice,
  Pixel,
  Placement,
} from "@liveplace/domain/ports";
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
const owner: Session = { userId: meta.ownerId, login: "owner1", displayName: "Owner 1" };

const proof: Pixel[] = [{ x: 1, y: 2, colorIndex: 3 }];
const bannedUsers: BannedUser[] = [
  { userId: "user-2", login: "user2", displayName: "User 2", pixelCount: 1 },
];

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

const moderate = (action: string, target = "user-2") =>
  JSON.stringify({ t: "moderate", requestId: "moderate-1", action: { action, target } });

type SetupOptions = {
  session?: Session | null;
  version?: number;
  duringSnapshot?: () => void;
  isBanned?: boolean;
  slices?: ModerationSlice[];
};

const setup = (options: SetupOptions = {}) => {
  const placements: Placement[] = [];
  const inspected: { x: number; y: number }[] = [];
  const moderations: Moderation[] = [];
  const listedPixels: string[] = [];
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
    async moderate(_asked: string, moderation: Moderation) {
      moderations.push(moderation);
      const slice = options.slices?.[moderations.length - 1] ?? { version: 9, cells: 0, isDone: true };
      return { ok: true as const, value: slice };
    },
    async isBanned() {
      return options.isBanned ?? false;
    },
    async listPixels(_asked: string, userId: string) {
      listedPixels.push(userId);
      return proof;
    },
    async listBans() {
      return bannedUsers;
    },
    async subscribe(_asked: string, onMessage: (message: LiveMessage) => void) {
      publishTo = onMessage;
      return async () => {
        publishTo = null;
      };
    },
  };

  const broadcast = createBroadcast(core);
  // Une connexion de plus sur le même noyau : un autre onglet, ou un autre joueur.
  const open = (opened: Session | null) => {
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
    return {
      connection: createConnection({ core, broadcast, now: () => now }, socket, opened),
      sent,
      closed,
    };
  };

  const { connection, sent, closed } = open(options.session === undefined ? session : options.session);
  return {
    connection,
    broadcast,
    sent,
    closed,
    placements,
    inspected,
    moderations,
    listedPixels,
    open,
    publish: (published: Event) => publishTo?.({ e: published }),
    control: (published: LiveControl) => publishTo?.({ ctl: published }),
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

  // Recopie la photo Twitch de la session dans le welcome, et rien sans elle (écart §4.3, JOURNAL 2026-09-24)
  it("copies the session's Twitch photo into the welcome, and nothing without one", async () => {
    const avatarUrl = "https://static-cdn.jtvnw.net/jtv_user_pictures/fenysk-profile_image-300x300.png";
    const withPhoto = setup({ session: { ...session, avatarUrl } });
    const withoutPhoto = setup();

    await withPhoto.connection.receive(hello());
    await withoutPhoto.connection.receive(hello());

    expect(withPhoto.sent[0]).toMatchObject({ t: "welcome", you: { userId: session.userId, avatarUrl } });
    expect(withoutPhoto.sent[0]).toMatchObject({ t: "welcome", you: { userId: session.userId } });
    expect(withoutPhoto.sent[0]).not.toHaveProperty("you.avatarUrl");
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

describe("moderation in the connection (§5.4, JOURNAL 2026-09-25)", () => {
  // Refuse la modération d'un viewer par forbidden, sans appeler le noyau, et le laisse connecté
  it("refuses a viewer's moderation with forbidden, without calling the core, and keeps it connected", async () => {
    const { connection, sent, closed, moderations } = setup();
    await connection.receive(hello());

    await connection.receive(moderate("clearUser"));
    await connection.receive(JSON.stringify({ t: "listBans", requestId: "bans-1" }));

    expect(sent.slice(-2)).toEqual([
      { t: "error", code: "forbidden" },
      { t: "error", code: "forbidden" },
    ]);
    expect(moderations).toEqual([]);
    expect(closed).toEqual([]);
  });

  // Enchaîne toutes les tranches d'un clearUser du propriétaire, une frame moderated chacune, à l'heure injectée
  it("runs every slice of the owner's clearUser, one moderated frame each, at the injected clock", async () => {
    const slices = [
      { version: 4, cells: 4096, isDone: false },
      { version: 5, cells: 4096, isDone: false },
      { version: 6, cells: 7, isDone: true },
    ];
    const { connection, sent, moderations } = setup({ session: owner, slices });
    await connection.receive(hello());

    await connection.receive(moderate("clearUser"));

    const action = { action: "clearUser", target: "user-2" };
    expect(moderations).toEqual([
      { by: owner.userId, nowMs: now, action, slice: "first" },
      { by: owner.userId, nowMs: now, action, slice: "next" },
      { by: owner.userId, nowMs: now, action, slice: "next" },
    ]);
    expect(sent.slice(-3)).toEqual([
      { t: "moderated", requestId: "moderate-1", version: 4, cells: 4096, done: false },
      { t: "moderated", requestId: "moderate-1", version: 5, cells: 4096, done: false },
      { t: "moderated", requestId: "moderate-1", version: 6, cells: 7, done: true },
    ]);
  });

  // Rend les pixels d'un auteur au propriétaire et à l'auteur lui-même, jamais à un autre viewer
  it("gives an author's pixels to the owner and to the author, never to another viewer", async () => {
    const context = setup({ session: owner });
    const self = context.open(session);
    const other = context.open({ ...session, userId: "user-3" });
    for (const opened of [context, self, other]) await opened.connection.receive(hello());
    const listPixels = JSON.stringify({ t: "listPixels", requestId: "pixels-1", userId: session.userId });

    for (const opened of [context, self, other]) await opened.connection.receive(listPixels);

    const answer = { t: "pixels", requestId: "pixels-1", userId: session.userId, pixels: proof };
    expect(context.sent.at(-1)).toEqual(answer);
    expect(self.sent.at(-1)).toEqual(answer);
    expect(other.sent.at(-1)).toEqual({ t: "error", code: "forbidden" });
    expect(context.listedPixels).toEqual([session.userId, session.userId]);
  });

  // Rend la liste des bannis au propriétaire
  it("gives the list of banned users to the owner", async () => {
    const { connection, sent } = setup({ session: owner });
    await connection.receive(hello());

    await connection.receive(JSON.stringify({ t: "listBans", requestId: "bans-1" }));

    expect(sent.at(-1)).toEqual({ t: "bans", requestId: "bans-1", users: bannedUsers });
  });

  // Envoie banned juste après le welcome et le snapshot d'un banni
  it("sends banned right after the welcome and the snapshot of a banned user", async () => {
    const { connection, sent } = setup({ isBanned: true });

    await connection.receive(hello());

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "banned",
    ]);
  });

  // Prévient en direct les seules sockets de la cible, de son ban puis de son débannissement
  it("tells only the target's sockets, live, about its ban and then its unban", async () => {
    const context = setup();
    const secondTab = context.open(session);
    const other = context.open({ ...session, userId: "user-3" });
    for (const opened of [context, secondTab, other]) await opened.connection.receive(hello());

    context.control({ t: "banned", userId: session.userId });
    context.control({ t: "unbanned", userId: session.userId });

    expect(context.sent.slice(-2)).toEqual([{ t: "banned" }, { t: "unbanned" }]);
    expect(secondTab.sent.slice(-2)).toEqual([{ t: "banned" }, { t: "unbanned" }]);
    expect(other.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual(["welcome", "snapshot"]);
  });

  // Garde un ban tombé pendant l'arrivée, et l'envoie après le welcome
  it("holds a ban that lands during the arrival, and sends it after the welcome", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ duringSnapshot: () => during.run?.() });
    during.run = () => context.control({ t: "banned", userId: session.userId });

    await context.connection.receive(hello());

    expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "banned",
    ]);
  });
});
