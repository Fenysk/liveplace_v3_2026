import {
  type CanvasMeta,
  DEVELOPER_USER_ID,
  type Device,
  defaultCanvasMeta,
  type GaugeLimits,
  type ObsBackground,
  type Session,
} from "@liveplace/domain";
import type {
  AckFrame,
  ActivityStore,
  BannedUser,
  CanvasCore,
  ClientSocket,
  GaugeClaim,
  InspectEntry,
  LiveControl,
  LiveMessage,
  Moderation,
  ModerationSlice,
  Moderator,
  ModeratorRole,
  OffStreamCell,
  Pixel,
  Placement,
  Report,
  ReportedPlacement,
  ScoreboardEntry,
  ScoreboardRank,
  TwitchSync,
} from "@liveplace/domain/ports";
import { type Event, PROTOCOL_VERSION, type ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { createActivity } from "./activity";
import { createBroadcast } from "./broadcast";
import { createConnection } from "./connection";

const canvasId = "canvas-1";
const now = 1_700_000_000_000;

const meta: CanvasMeta = {
  ...defaultCanvasMeta("owner-1"),
  width: 4,
  height: 4,
  gaugeMaxStart: 3,
  refillMs: 1000,
  obsDelayMs: 5000,
};

const session: Session = { userId: "user-1", login: "user1", displayName: "User 1" };
const developer: Session = { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" };

// Le suivi d'activité garde ses nombres ailleurs : ici, il n'y a rien à relire (écart §5.1, JOURNAL 2026-10-06).
const activityStore: ActivityStore = {
  storeActivityMinute: async () => undefined,
  pruneActivity: async () => undefined,
  listActivityHistory: async () => [],
  listCanvasPixels: async () => [],
  getDaySignups: async () => ({ total: 0, byDiscoveredViaUserId: new Map() }),
  getUser: async (userId) => ({ userId, login: userId, displayName: userId }),
};
const owner: Session = { userId: meta.ownerId, login: "owner1", displayName: "Owner 1" };

const proof: Pixel[] = [{ x: 1, y: 2, colorIndex: 3 }];
const bannedUsers: BannedUser[] = [
  {
    userId: "user-2",
    login: "user2",
    displayName: "User 2",
    pixelCount: 1,
    isFromTwitch: true,
    hasAccount: true,
  },
];
const moderators: Moderator[] = [
  {
    userId: "mod-1",
    login: "mod1",
    displayName: "Mod 1",
    isFromTwitch: true,
    isNamedHere: false,
    hasAccount: false,
  },
];

const reportedPlacements: ReportedPlacement[] = [
  {
    userId: "user-2",
    login: "user2",
    displayName: "User 2",
    hasAccount: true,
    placementId: "puser2001",
    reportCount: 2,
    reportedAt: now,
    isOffStream: true,
    pixels: [{ x: 1, y: 2, colorIndex: 3 }],
  },
];

const authoredPixels = [{ x: 1, y: 2, colorIndex: 3, placedAt: now, placementId: "puser2001" }];

const ack: AckFrame = {
  t: "ack",
  requestId: "request-1",
  version: 3,
  accepted: 1,
  rejected: [],
  gauge: { charges: 2, max: meta.gaugeMaxStart, nextRefillAt: now + meta.refillMs, claimable: 0 },
};

// Ce qu'en voit qui ne modère pas : tout, sauf l'identifiant (écart §4.3, JOURNAL 2026-09-27).
const publicEntry: InspectEntry = {
  login: "user2",
  displayName: "User 2",
  colorIndex: 3,
  placedAt: now,
  placementId: "puser2001",
};
const entry: InspectEntry = { userId: "user-2", ...publicEntry };

// Laisse finir ce qu'un message de contrôle a lancé : la relecture d'un rôle est asynchrone.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const inspect = (x: number, y: number) => JSON.stringify({ t: "inspect", requestId: "inspect-1", x, y });

const hello = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ t: "hello", protocolVersion: PROTOCOL_VERSION, canvasId, mode: "ui", ...overrides });

const place = () =>
  JSON.stringify({
    t: "place",
    requestId: ack.requestId,
    placementId: "puser1001",
    pixels: [{ x: 1, y: 2, colorIndex: 3 }],
  });

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
  isModerator?: boolean;
  twitchSync?: TwitchSync; // l'état de la synchro Twitch lu dans `meta`
  version?: number;
  duringSnapshot?: () => void;
  isBanned?: boolean;
  slices?: ModerationSlice[];
  resync?: Event[] | null; // ce que rend `listEvents` ; absent : le stream ne peut pas resynchroniser
  recent?: Event[]; // ce que rend `listRecentEvents`
  offStream?: OffStreamCell[]; // ce que rend `listOffStreamCells`
  reportCount?: number; // ce que rend `getReportCount`
  canReport?: boolean; // ce que rend `canReport`
  report?: Awaited<ReturnType<CanvasCore["report"]>>; // ce que rend `report`
  archivedAt?: number; // le canvas est une archive (Écart §15, JOURNAL 2026-10-06)
  isRefusedByScripts?: boolean; // les scripts répondent `canvas_archived`, comme après un archivage que le gateway ignore encore
  scoreboard?: ScoreboardEntry[]; // ce que rend `listScoreboard`
  ranks?: Map<string, ScoreboardRank>; // ce que rend `listScoreboardRanks`
};

// Ce que répond un script à qui écrit sur une archive.
const archivedRefusal = { ok: false as const, error: "canvas_archived" as const };

const setup = (options: SetupOptions = {}) => {
  const placements: Placement[] = [];
  const inspected: { x: number; y: number }[] = [];
  const moderations: Moderation[] = [];
  const listedPixels: string[] = [];
  const scoreboardReads: string[] = []; // les canvas dont le classement a été lu
  const recentSince: number[] = [];
  const obsDelays: number[] = [];
  const obsBackgrounds: string[] = [];
  const claims: GaugeClaim[] = [];
  const gaugeLimits: GaugeLimits[] = [];
  const namedModerators: ModeratorRole[] = [];
  const reports: Report[] = [];
  let publishTo: ((message: LiveMessage) => void) | null = null;
  const roles = { isModerator: options.isModerator ?? false }; // ce que rend `isModerator`, modifiable en cours de test
  // `resizeCanvas` la change, comme resize.lua
  let currentMeta: CanvasMeta =
    options.archivedAt === undefined ? meta : { ...meta, archivedAt: options.archivedAt };
  const core = {
    async getCanvas(asked: string) {
      return asked === canvasId ? currentMeta : null;
    },
    async isModerator() {
      return roles.isModerator;
    },
    async getSnapshot() {
      options.duringSnapshot?.();
      return {
        state: new Uint8Array(currentMeta.width * currentMeta.height),
        version: options.version ?? 0,
      };
    },
    async getGauge(_asked: string, _userId: string, nowMs: number) {
      return { ...ack.gauge, nextRefillAt: nowMs + meta.refillMs, claimable: 0 };
    },
    async inspect(_asked: string, x: number, y: number) {
      inspected.push({ x, y });
      return x === 1 && y === 2 ? entry : null;
    },
    async place(_asked: string, placement: Placement) {
      placements.push(placement);
      return options.isRefusedByScripts ? archivedRefusal : { ok: true as const, value: ack };
    },
    async moderate(_asked: string, moderation: Moderation) {
      moderations.push(moderation);
      if (options.isRefusedByScripts) return archivedRefusal;
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
    async listModerators() {
      return moderators;
    },
    async getTwitchSync() {
      return options.twitchSync ?? null;
    },
    async listEvents() {
      return options.resync ?? null;
    },
    async listRecentEvents(_asked: string, sinceMs: number) {
      recentSince.push(sinceMs);
      return options.recent ?? [];
    },
    async setObsDelay(_asked: string, obsDelayMs: number) {
      obsDelays.push(obsDelayMs);
    },
    async setObsBackground(_asked: string, obsBackground: ObsBackground) {
      obsBackgrounds.push(obsBackground);
    },
    async claimGauge(_asked: string, claim: GaugeClaim) {
      claims.push(claim);
      if (options.isRefusedByScripts) return archivedRefusal;
      return { ok: true as const, value: { ...ack, requestId: claim.requestId } };
    },
    async setGaugeLimits(_asked: string, limits: GaugeLimits) {
      gaugeLimits.push(limits);
    },
    async setModerator(_asked: string, role: ModeratorRole) {
      namedModerators.push(role);
      return options.isRefusedByScripts ? archivedRefusal : { ok: true as const, value: undefined };
    },
    async getModeratorOrigin() {
      return roles.isModerator ? { isFromTwitch: true, isNamedHere: false } : null;
    },
    async report(_asked: string, sent: Report) {
      reports.push(sent);
      if (options.isRefusedByScripts) return archivedRefusal;
      return options.report ?? { ok: true as const, value: undefined };
    },
    async canReport() {
      return options.canReport ?? true;
    },
    async listReports() {
      return reportedPlacements;
    },
    async getReportCount() {
      return options.reportCount ?? 0;
    },
    async listOffStreamCells() {
      return options.offStream ?? [];
    },
    async listScoreboard(asked: string) {
      scoreboardReads.push(asked);
      return options.scoreboard ?? [];
    },
    async listScoreboardRanks(_asked: string, userIds: readonly string[]) {
      return new Map([...(options.ranks ?? [])].filter(([userId]) => userIds.includes(userId)));
    },
    async resizeCanvas(_asked: string, { width, height }: { width: number; height: number }) {
      if (options.isRefusedByScripts) return archivedRefusal;
      currentMeta = { ...currentMeta, width, height };
      return { ok: true as const, value: undefined };
    },
    async listAuthorPixels(_asked: string, x: number, y: number) {
      return x === 1 && y === 2 ? authoredPixels : null;
    },
    async subscribe(_asked: string, onMessage: (message: LiveMessage) => void) {
      publishTo = onMessage;
      return async () => {
        publishTo = null;
      };
    },
  };

  const broadcast = createBroadcast(core);
  const clock = { nowMs: now };
  const activity = createActivity({
    store: activityStore,
    core,
    now: () => clock.nowMs,
    isProduction: false,
  });
  // Une connexion de plus sur le même noyau : un autre onglet, ou un autre joueur.
  const open = (opened: Session | null, device: Device = "desktop") => {
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
      connection: createConnection(
        { core, broadcast, activity, now: () => clock.nowMs },
        socket,
        opened,
        device,
      ),
      sent,
      closed,
    };
  };

  const { connection, sent, closed } = open(options.session === undefined ? session : options.session);
  return {
    connection,
    broadcast,
    activity,
    sent,
    closed,
    placements,
    inspected,
    moderations,
    listedPixels,
    scoreboardReads,
    recentSince,
    obsDelays,
    obsBackgrounds,
    claims,
    gaugeLimits,
    namedModerators,
    reports,
    clock,
    roles,
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
      params: { gaugeMaxStart: meta.gaugeMaxStart, obsDelayMs: meta.obsDelayMs },
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
      gauge: { ...ack.gauge, nextRefillAt: now + meta.refillMs, claimable: 0 },
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
        placementId: "puser1001",
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

  // Répond à une inspection par l'auteur du pixel sans son identifiant, invité compris (écart §4.3, JOURNAL 2026-09-27)
  it("answers an inspection with the pixel's author but not its id, for a guest too", async () => {
    const { connection, sent } = setup({ session: null });
    await connection.receive(hello());

    await connection.receive(inspect(1, 2));

    expect(sent.at(-1)).toEqual({ t: "inspected", requestId: "inspect-1", x: 1, y: 2, entry: publicEntry });
  });

  // Tait l'identifiant de l'auteur à un viewer, et le donne au propriétaire et à un modérateur, qui modèrent
  it("hides the author's id from a viewer, and gives it to the owner and to a moderator", async () => {
    const byViewer = setup();
    const byOwner = setup({ session: owner });
    const byModerator = setup({ isModerator: true });

    for (const { connection } of [byViewer, byOwner, byModerator]) {
      await connection.receive(hello());
      await connection.receive(inspect(1, 2));
    }

    const inspected = { t: "inspected", requestId: "inspect-1", x: 1, y: 2 };
    expect(byViewer.sent.at(-1)).toEqual({ ...inspected, entry: { ...publicEntry, canReport: true } });
    expect(byOwner.sent.at(-1)).toEqual({ ...inspected, entry: { ...entry, canReport: true } });
    expect(byModerator.sent.at(-1)).toEqual({ ...inspected, entry: { ...entry, canReport: true } });
  });

  // Dit au propriétaire, en inspectant, que l'auteur est modérateur et d'où il vient, et à lui seul (JOURNAL 2026-09-27)
  it("tells the owner, on inspection, that the author is a moderator and where from, and only the owner", async () => {
    const byOwner = setup({ session: owner, isModerator: true });
    const byModerator = setup({ isModerator: true });

    for (const { connection } of [byOwner, byModerator]) {
      await connection.receive(hello());
      await connection.receive(inspect(1, 2));
    }

    const inspected = { t: "inspected", requestId: "inspect-1", x: 1, y: 2 };
    const moderatorOrigin = { isFromTwitch: true, isNamedHere: false };
    expect(byOwner.sent.at(-1)).toEqual({
      ...inspected,
      entry: { ...entry, canReport: true, moderatorOrigin },
    });
    expect(byModerator.sent.at(-1)).toEqual({ ...inspected, entry: { ...entry, canReport: true } });
  });

  // Refuse la 11e inspection d'une même seconde sans fermer, en nommant la requête, puis accepte une seconde plus tard
  it("refuses the 11th inspection within a second without closing, naming the request, then accepts a second later", async () => {
    const { connection, sent, closed, inspected, clock } = setup({ session: null });
    await connection.receive(hello());
    for (let count = 0; count < 10; count += 1) await connection.receive(inspect(1, 2));

    await connection.receive(JSON.stringify({ t: "inspect", requestId: "inspect-11", x: 1, y: 2 }));

    expect(sent.at(-1)).toEqual({ t: "error", code: "rate_limited", requestId: "inspect-11" });
    expect(inspected).toHaveLength(10);
    expect(closed).toEqual([]);

    clock.nowMs += 1000;
    await connection.receive(inspect(1, 2));
    expect(sent.at(-1)).toMatchObject({ t: "inspected", requestId: "inspect-1" });
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

  // Remet le même objet frame à deux clients du canvas : l'infra ne le sérialise qu'une fois (JOURNAL 2026-09-26)
  it("hands the very same frame object to two clients of the canvas", async () => {
    const context = setup();
    const other = context.open(null);
    await context.connection.receive(hello());
    await other.connection.receive(hello());

    context.publish(event(1, 1, 5));
    context.broadcast.tick();

    expect(context.sent.at(-1)).toMatchObject({ t: "cells", toVersion: 1 });
    expect(other.sent.at(-1)).toBe(context.sent.at(-1));
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

  // Rend les modérateurs au propriétaire et à un modérateur, jamais à un viewer (JOURNAL 2026-09-27)
  it("gives the moderators to the owner and to a moderator, never to a viewer", async () => {
    const byOwner = setup({ session: owner });
    const byModerator = setup({ isModerator: true });
    const byViewer = setup();
    const listModerators = JSON.stringify({ t: "listModerators", requestId: "mods-1" });

    for (const { connection } of [byOwner, byModerator, byViewer]) {
      await connection.receive(hello());
      await connection.receive(listModerators);
    }

    const answer = { t: "moderators", requestId: "mods-1", users: moderators };
    expect(byOwner.sent.at(-1)).toEqual(answer);
    expect(byModerator.sent.at(-1)).toEqual(answer);
    expect(byViewer.sent.at(-1)).toEqual({ t: "error", code: "forbidden" });
  });

  // Joint aux modérateurs l'état de la synchro Twitch, quand elle a été faite (JOURNAL 2026-09-27)
  it("joins the state of the Twitch sync to the moderators, once it was done", async () => {
    const twitchSync = { status: "ok", syncedAt: now } as const;
    const { connection, sent } = setup({ session: owner, twitchSync });
    await connection.receive(hello());

    await connection.receive(JSON.stringify({ t: "listModerators", requestId: "mods-1" }));

    expect(sent.at(-1)).toEqual({ t: "moderators", requestId: "mods-1", users: moderators, twitchSync });
  });

  // Laisse le seul propriétaire nommer ou retirer un modérateur ici, et répond par la liste (JOURNAL 2026-09-27)
  it("lets only the owner name or remove a moderator here, and answers with the list", async () => {
    const byOwner = setup({ session: owner });
    const byModerator = setup({ isModerator: true });
    const name = JSON.stringify({
      t: "setModerator",
      requestId: "name-1",
      userId: "user-2",
      isModerator: true,
    });

    for (const { connection } of [byOwner, byModerator]) {
      await connection.receive(hello());
      await connection.receive(name);
    }

    expect(byOwner.namedModerators).toEqual([{ userId: "user-2", source: "liveplace", isModerator: true }]);
    expect(byOwner.sent.at(-1)).toEqual({ t: "moderators", requestId: "name-1", users: moderators });
    expect(byModerator.namedModerators).toEqual([]);
    expect(byModerator.sent.at(-1)).toEqual({ t: "error", code: "forbidden" });
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

  // Relit en direct le rôle des seules sockets de la personne nommée puis retirée, sans reconnexion (JOURNAL 2026-09-27)
  it("rereads, live, the role of the named then removed person's sockets only, without reconnecting", async () => {
    const context = setup();
    const other = context.open({ ...session, userId: "user-3" });
    for (const opened of [context, other]) await opened.connection.receive(hello());

    context.roles.isModerator = true;
    context.control({ t: "role", userId: session.userId });
    await flush();
    expect(context.sent.slice(-2)).toEqual([
      { t: "role", role: "moderator" },
      { t: "reportCount", count: 0 },
    ]);
    await context.connection.receive(moderate("clearUser"));
    expect(context.moderations).toHaveLength(1);

    context.roles.isModerator = false;
    context.control({ t: "role", userId: session.userId });
    await flush();
    expect(context.sent.at(-1)).toEqual({ t: "role", role: "viewer" });
    await context.connection.receive(moderate("clearUser"));
    expect(context.sent.at(-1)).toEqual({ t: "error", code: "forbidden" });
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

  // Dit en direct à qui modère que la liste des bannis a bougé, quelle que soit la cible, et à personne d'autre (JOURNAL 2026-10-06)
  it("tells the owner and the moderators, live, that the banned list is stale whoever the target is, and no one else", async () => {
    const byOwner = setup({ session: owner });
    const byModerator = setup({ isModerator: true });
    const byViewer = setup();
    const byGuest = setup({ session: null });
    for (const context of [byOwner, byModerator, byViewer, byGuest])
      await context.connection.receive(hello());

    for (const context of [byOwner, byModerator, byViewer, byGuest]) {
      context.control({ t: "banned", userId: "user-2" });
      context.control({ t: "unbanned", userId: "user-2" });
    }

    const stale: ServerFrame = { t: "staleList", list: "bans" };
    for (const context of [byOwner, byModerator]) expect(context.sent.slice(3)).toEqual([stale, stale]);
    for (const context of [byViewer, byGuest])
      expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
        "welcome",
        "snapshot",
      ]);
  });

  // Dit à qui modère que la liste des modérateurs a bougé quand le rôle de quelqu'un d'autre change (JOURNAL 2026-10-06)
  it("tells the moderators that the moderator list is stale when someone else's role changes", async () => {
    const byOwner = setup({ session: owner });
    const byViewer = setup();
    for (const context of [byOwner, byViewer]) await context.connection.receive(hello());

    for (const context of [byOwner, byViewer]) context.control({ t: "role", userId: "mod-1" });

    expect(byOwner.sent.at(-1)).toEqual({ t: "staleList", list: "moderators" });
    expect(byViewer.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
    ]);
  });

  // Garde la liste périmée tombée pendant l'arrivée, et l'envoie après le welcome (JOURNAL 2026-10-06)
  it("holds a stale list that lands during the arrival, and sends it after the welcome", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ session: owner, duringSnapshot: () => during.run?.() });
    during.run = () => context.control({ t: "banned", userId: "user-2" });

    await context.connection.receive(hello());

    expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "reportCount",
      "staleList",
    ]);
  });
});

describe("resync and the OBS view (§4.5, §9.5, JOURNAL 2026-09-25)", () => {
  const cell = (version: number, x: number) => ({
    x,
    y: 2,
    colorIndex: 5,
    previousColorIndex: 0,
    placedAt: now,
    version,
    kind: "place" as const,
  });

  // Reprend depuis lastVersion : un welcome sans snapshot, puis les cases manquées, sans conflation
  it("resyncs from lastVersion: a welcome without a snapshot, then the missed cells, not conflated", async () => {
    const { connection, sent } = setup({ resync: [event(4, 1, 5), event(5, 1, 5)] });

    await connection.receive(hello({ lastVersion: 3 }));

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual(["welcome", "cells"]);
    expect(sent[0]).toMatchObject({ t: "welcome", version: 3 });
    expect(sent[1]).toEqual({ t: "cells", toVersion: 5, cells: [cell(4, 1), cell(5, 1)] });
  });

  // Reprend sans rien envoyer de plus quand rien n'a été manqué
  it("resyncs with nothing more when nothing was missed", async () => {
    const { connection, sent } = setup({ resync: [] });

    await connection.receive(hello({ lastVersion: 3 }));

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual(["welcome"]);
  });

  // Repart d'un snapshot quand le stream ne peut pas resynchroniser
  it("falls back to a snapshot when the stream cannot resync", async () => {
    const { connection, sent } = setup({ resync: null });

    await connection.receive(hello({ lastVersion: 3 }));

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual(["welcome", "snapshot"]);
  });

  // Joint à un welcome OBS avec snapshot les cases récentes, jamais plus récentes que lui, lues à l'heure du délai
  it("joins the recent cells to an OBS welcome with a snapshot, never newer than it, read at the delay", async () => {
    const context = setup({ version: 5, recent: [event(4, 1, 5), event(6, 2, 5)] });

    await context.connection.receive(hello({ mode: "obs" }));

    expect(context.recentSince).toEqual([now - meta.obsDelayMs]);
    expect(context.sent[0]).toMatchObject({ t: "welcome", recent: { toVersion: 4, cells: [cell(4, 1)] } });
  });

  // Ne joint jamais recent à un welcome du jeu, ni à un resync de la vue OBS
  it("never joins recent to a game welcome, nor to an OBS resync", async () => {
    const game = setup({ recent: [event(1, 1, 5)] });
    const resync = setup({ resync: [], recent: [event(1, 1, 5)] });

    await game.connection.receive(hello());
    await resync.connection.receive(hello({ mode: "obs", lastVersion: 3 }));

    expect(game.sent[0]).not.toHaveProperty("recent");
    expect(resync.sent[0]).not.toHaveProperty("recent");
  });

  // Ne laisse que le streamer régler le délai OBS, et le transmet à toutes les pages du canvas
  it("lets only the owner set the OBS delay, and hands it to every page of the canvas", async () => {
    const context = setup({ session: owner });
    const viewer = context.open(session);
    const guest = context.open(null);
    for (const opened of [context, viewer, guest]) await opened.connection.receive(hello());
    const setObsDelay = JSON.stringify({ t: "setObsDelay", requestId: "delay-1", obsDelayMs: 60_000 });

    await viewer.connection.receive(setObsDelay);
    await context.connection.receive(setObsDelay);
    context.control({ t: "obsDelay", obsDelayMs: 60_000 });

    expect(viewer.sent.at(-2)).toEqual({ t: "error", code: "forbidden" });
    expect(context.obsDelays).toEqual([60_000]);
    for (const opened of [context, viewer, guest])
      expect(opened.sent.at(-1)).toEqual({ t: "obsDelay", obsDelayMs: 60_000 });
  });

  // Donne le fond OBS au welcome, ne laisse que le streamer le changer, et le transmet à toutes les pages (JOURNAL 2026-09-29)
  it("gives the OBS background in the welcome, lets only the owner change it, and hands it to every page", async () => {
    const context = setup({ session: owner });
    const viewer = context.open(session);
    for (const opened of [context, viewer]) await opened.connection.receive(hello());
    const setWhite = JSON.stringify({ t: "setObsBackground", requestId: "bg-1", obsBackground: "white" });

    await viewer.connection.receive(setWhite);
    await context.connection.receive(setWhite);
    context.control({ t: "obsBackground", obsBackground: "white" });

    expect(viewer.sent[0]).toMatchObject({ t: "welcome", params: { obsBackground: "transparent" } });
    expect(viewer.sent.at(-2)).toEqual({ t: "error", code: "forbidden" });
    expect(context.obsBackgrounds).toEqual(["white"]);
    for (const opened of [context, viewer])
      expect(opened.sent.at(-1)).toEqual({ t: "obsBackground", obsBackground: "white" });
  });

  // Le fond noir passe comme le blanc : le streamer le demande, le cœur l'écrit
  it("passes the black OBS background the owner asks for, like white", async () => {
    const context = setup({ session: owner });
    await context.connection.receive(hello());

    await context.connection.receive(
      JSON.stringify({ t: "setObsBackground", requestId: "bg-2", obsBackground: "black" }),
    );

    expect(context.obsBackgrounds).toEqual(["black"]);
  });

  // Ne laisse que le streamer régler les bornes de la jauge, et donne à chaque compte sa jauge recalculée (JOURNAL 2026-09-30)
  it("lets only the owner set the gauge limits, and gives every account its recomputed gauge", async () => {
    const context = setup({ session: owner });
    const viewer = context.open(session);
    const guest = context.open(null);
    for (const opened of [context, viewer, guest]) await opened.connection.receive(hello());
    const limits = { gaugeMaxStart: 20, gaugeMaxCeiling: 40 };
    const setLimits = JSON.stringify({ t: "setGaugeLimits", requestId: "limits-1", ...limits });

    await viewer.connection.receive(setLimits);
    await context.connection.receive(setLimits);
    context.control({ t: "gaugeLimits", ...limits });
    await new Promise((resolve) => setImmediate(resolve));

    expect(viewer.sent[0]).toMatchObject({ t: "welcome", params: { gaugeMaxStart: meta.gaugeMaxStart } });
    expect(viewer.sent.at(-3)).toEqual({ t: "error", code: "forbidden" });
    expect(context.gaugeLimits).toEqual([limits]);
    for (const opened of [context, viewer]) {
      expect(opened.sent.at(-2)).toEqual({ t: "gaugeLimits", ...limits });
      expect(opened.sent.at(-1)).toMatchObject({ t: "gauge", max: ack.gauge.max });
    }
    expect(guest.sent.at(-1)).toEqual({ t: "gaugeLimits", ...limits });
  });

  // Refuse à un invité une réclamation, et répond à un compte par l'ack du noyau (JOURNAL 2026-09-30)
  it("refuses a claim from a guest, and answers an account with the core's ack", async () => {
    const context = setup();
    const guest = context.open(null);
    for (const opened of [context, guest]) await opened.connection.receive(hello());
    const claim = JSON.stringify({ t: "claimGauge", requestId: "claim-1" });

    await guest.connection.receive(claim);
    await context.connection.receive(claim);

    expect(guest.sent.at(-1)).toEqual({ t: "error", code: "unauthenticated", requestId: "claim-1" });
    expect(context.claims).toEqual([{ userId: session.userId, requestId: "claim-1", nowMs: now }]);
    expect(context.sent.at(-1)).toEqual({ ...ack, requestId: "claim-1" });
  });

  // Garde un changement de délai tombé pendant l'arrivée, et l'envoie après le welcome
  it("holds a delay change that lands during the arrival, and sends it after the welcome", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ duringSnapshot: () => during.run?.() });
    during.run = () => context.control({ t: "obsDelay", obsDelayMs: 0 });

    await context.connection.receive(hello());

    expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "obsDelay",
    ]);
  });
});

describe("reports in the connection (JOURNAL 2026-09-28)", () => {
  const report = () =>
    JSON.stringify({ t: "report", requestId: "report-1", x: 1, y: 2, placementId: "puser2001" });

  // Compte chaque compte connecté une fois pour le seuil, jamais un invité ni la vue OBS
  it("counts each connected account once for the threshold, never a guest nor the OBS view", async () => {
    const context = setup();
    const others = ["user-3", "user-4", "user-5", "user-6"].map((userId) =>
      context.open({ ...session, userId }),
    );
    const pages = [context, context.open(session), context.open(null), ...others];
    for (const { connection } of pages) await connection.receive(hello());
    const obs = context.open({ ...session, userId: "user-8" });
    await obs.connection.receive(hello({ mode: "obs" }));

    await context.connection.receive(report());
    const sixth = context.open({ ...session, userId: "user-7" });
    await sixth.connection.receive(hello());
    await context.connection.receive(report());

    expect(context.reports.map(({ threshold }) => threshold)).toEqual([1, 2]);
    expect(context.reports[0]).toEqual({
      reporterId: session.userId,
      x: 1,
      y: 2,
      placementId: "puser2001",
      threshold: 1,
      nowMs: now,
    });
    expect(context.sent.at(-1)).toEqual({ t: "reported", requestId: "report-1" });
  });

  // Transmet la plage signalée au noyau (JOURNAL 2026-09-29)
  it("forwards the reported range to the core", async () => {
    const context = setup();
    await context.connection.receive(hello());
    const range = { from: now - 60_000, to: now + 60_000 };

    await context.connection.receive(
      JSON.stringify({ t: "report", requestId: "report-1", x: 1, y: 2, placementId: "puser2001", range }),
    );

    expect(context.reports[0]?.range).toEqual(range);
  });

  // Donne les pixels de l'auteur à un compte connecté seulement, et refuse une case qui a changé (JOURNAL 2026-09-29)
  it("gives the author's pixels to a signed-in account only, and refuses a cell that has changed", async () => {
    const bySession = setup();
    const byGuest = setup({ session: null });
    const listAuthorPixels = (x: number) =>
      JSON.stringify({ t: "listAuthorPixels", requestId: "author-1", x, y: 2, placementId: "puser2001" });
    for (const { connection } of [bySession, byGuest]) {
      await connection.receive(hello());
      await connection.receive(listAuthorPixels(1));
    }
    await bySession.connection.receive(listAuthorPixels(3));

    expect(bySession.sent.at(-2)).toEqual({
      t: "authorPixels",
      requestId: "author-1",
      pixels: authoredPixels,
    });
    expect(bySession.sent.at(-1)).toEqual({ t: "error", code: "forbidden", requestId: "author-1" });
    expect(byGuest.sent.at(-1)).toEqual({ t: "error", code: "unauthenticated", requestId: "author-1" });
  });

  // Refuse un invité et une pose qui ne se signale pas, en nommant la requête, sans fermer
  it("refuses a guest and a placement that cannot be reported, naming the request, without closing", async () => {
    const byGuest = setup({ session: null });
    const refused = setup({ report: { ok: false, error: "forbidden" } });
    for (const { connection } of [byGuest, refused]) {
      await connection.receive(hello());
      await connection.receive(report());
    }

    expect(byGuest.reports).toEqual([]);
    expect(byGuest.sent.at(-1)).toEqual({ t: "error", code: "unauthenticated", requestId: "report-1" });
    expect(refused.sent.at(-1)).toEqual({ t: "error", code: "forbidden", requestId: "report-1" });
    expect([...byGuest.closed, ...refused.closed]).toEqual([]);
  });

  // Ne propose pas de signaler sa propre pose, et rien à un invité
  it("does not offer to report one's own placement, and nothing to a guest", async () => {
    const byAuthor = setup({ session: { ...session, userId: "user-2" } });
    const byGuest = setup({ session: null });
    for (const { connection } of [byAuthor, byGuest]) {
      await connection.receive(hello());
      await connection.receive(inspect(1, 2));
    }

    expect(byAuthor.sent.at(-1)).toMatchObject({ entry: { canReport: false } });
    expect(byGuest.sent.at(-1)).toMatchObject({ entry: publicEntry });
    expect(byGuest.sent.at(-1)).not.toHaveProperty("entry.canReport");
  });

  // Donne la liste et le nombre des signalements à qui modère seulement, à l'arrivée puis en direct
  it("gives the reports and their count to moderators only, on arrival then live", async () => {
    const byModerator = setup({ isModerator: true, reportCount: 3 });
    const byViewer = setup({ reportCount: 3 });
    for (const context of [byModerator, byViewer]) {
      await context.connection.receive(hello());
      context.control({ t: "reports", count: 4 });
      await context.connection.receive(JSON.stringify({ t: "listReports", requestId: "reports-1" }));
    }

    expect(byModerator.sent[2]).toEqual({ t: "reportCount", count: 3 });

    expect(byModerator.sent.slice(-2)).toEqual([
      { t: "reportCount", count: 4 },
      { t: "reports", requestId: "reports-1", reports: reportedPlacements },
    ]);
    expect(byViewer.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "error",
    ]);
  });

  // Donne à une vue OBS qui arrive l'image du stream, sans les poses cachées ; la page garde l'état réel
  it("gives an arriving OBS view the stream's image, without the hidden placements; the page keeps the real state", async () => {
    const offStream = [{ x: 1, y: 2, colorIndex: 9 }];
    const byObs = setup({ session: null, offStream });
    const byPage = setup({ session: null, offStream });
    await byObs.connection.receive(hello({ mode: "obs" }));
    await byPage.connection.receive(hello());

    const shown = new Uint8Array(meta.width * meta.height);
    shown[2 * meta.width + 1] = 9;
    expect(byObs.sent.at(-1)).toEqual({ snapshot: shown });
    expect(byPage.sent.at(-1)).toEqual({ snapshot: new Uint8Array(meta.width * meta.height) });
  });
});

describe("resizing the canvas (JOURNAL 2026-09-29)", () => {
  const resize = (width: number, height: number) =>
    JSON.stringify({ t: "resizeCanvas", requestId: "resize-1", width, height });

  // Change la taille pour le seul streamer
  it("resizes for the owner only", async () => {
    const byOwner = setup({ session: owner });
    const byViewer = setup();
    for (const { connection } of [byOwner, byViewer]) {
      await connection.receive(hello());
      await connection.receive(resize(64, 36));
    }

    expect(byOwner.sent.at(-1)).toEqual({ t: "resized", requestId: "resize-1" });
    expect(byViewer.sent.at(-1)).toEqual({ t: "error", code: "forbidden", requestId: "resize-1" });
  });

  // À une nouvelle taille, chaque page reprend un welcome et un snapshot, sans se reconnecter
  it("at a new size, each page gets a new welcome and snapshot, without reconnecting", async () => {
    const context = setup({ session: owner });
    const other = context.open(session);
    for (const opened of [context, other]) await opened.connection.receive(hello());

    await context.connection.receive(resize(64, 36));
    context.control({ t: "resize" });
    await flush();

    for (const opened of [context, other]) {
      const welcomes = opened.sent.filter((frame) => "t" in frame && frame.t === "welcome");
      const snapshots = opened.sent.filter((frame) => "snapshot" in frame);
      expect(welcomes.at(-1)).toMatchObject({ canvas: { width: 64, height: 36 } });
      expect(snapshots.at(-1)).toEqual({ snapshot: new Uint8Array(64 * 36) });
      expect(opened.closed).toEqual([]);
    }
    await other.connection.receive(inspect(63, 35));
    expect(context.inspected).toEqual([{ x: 63, y: 35 }]);
  });
});

describe("the status of the canvas (Écart §15, JOURNAL 2026-10-06)", () => {
  // Annonce le statut du canvas à toutes ses pages, page et vue OBS, invité compris
  it("announces the status of the canvas to every page of it, OBS view and guest included", async () => {
    const context = setup({ session: owner });
    const obs = context.open(null);
    const guest = context.open(null);
    await context.connection.receive(hello());
    await obs.connection.receive(hello({ mode: "obs" }));
    await guest.connection.receive(hello());

    context.control({ t: "canvasStatus", status: "archived" });

    for (const opened of [context, obs, guest])
      expect(opened.sent.at(-1)).toEqual({ t: "canvasStatus", status: "archived" });
  });

  // Garde un statut tombé pendant l'arrivée, et l'envoie après le welcome
  it("holds a status that lands during the arrival, and sends it after the welcome", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ duringSnapshot: () => during.run?.() });
    during.run = () => context.control({ t: "canvasStatus", status: "active" });

    await context.connection.receive(hello());

    expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
      "canvasStatus",
    ]);
  });
});

describe("an archive in the connection (Écart §15, JOURNAL 2026-10-06)", () => {
  const archivedAt = now - 86_400_000;
  const frames = {
    place: JSON.parse(place()),
    claimGauge: { t: "claimGauge", requestId: "claim-1" },
    moderate: JSON.parse(moderate("ban")),
    setModerator: { t: "setModerator", requestId: "moderator-1", userId: "user-2", isModerator: true },
    report: { t: "report", requestId: "report-1", x: 1, y: 2, placementId: "puser2001" },
    resizeCanvas: { t: "resizeCanvas", requestId: "resize-1", width: 64, height: 36 },
    setObsDelay: { t: "setObsDelay", requestId: "delay-1", obsDelayMs: 60_000 },
    setObsBackground: { t: "setObsBackground", requestId: "background-1", obsBackground: "white" },
    setGaugeLimits: { t: "setGaugeLimits", requestId: "limits-1", gaugeMaxStart: 20, gaugeMaxCeiling: 40 },
    listBans: { t: "listBans", requestId: "bans-1" },
    listModerators: { t: "listModerators", requestId: "moderators-1" },
    listReports: { t: "listReports", requestId: "reports-1" },
    listPixels: { t: "listPixels", requestId: "pixels-1", userId: "user-2" },
    listAuthorPixels: { t: "listAuthorPixels", requestId: "author-1", x: 1, y: 2, placementId: "puser2001" },
  };

  // Répond au hello d'une archive par un welcome qui le dit, puis le snapshot : ni jauge, ni ban, ni signalements
  it("answers the hello of an archive with a welcome that says so, then the snapshot: no gauge, ban nor reports", async () => {
    const { connection, sent } = setup({ session: owner, archivedAt, isBanned: true, reportCount: 4 });

    await connection.receive(hello());

    expect(sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual(["welcome", "snapshot"]);
    expect(sent[0]).toMatchObject({ t: "welcome", canvas: { canvasId, archivedAt }, you: { role: "owner" } });
    expect(sent[0]).not.toHaveProperty("gauge");
  });

  // Ne dit rien du classement à une archive, même là où des scores existent, et ne le lit pas : elle n'en montre aucun
  it("says nothing of the scoreboard to an archive, even where scores exist, and does not read it", async () => {
    const ranks = new Map([[owner.userId, { rank: 1, pixels: 9 }]]);
    const context = setup({
      session: owner,
      archivedAt,
      scoreboard: [{ login: "ada", displayName: "Ada", pixels: 9 }],
      ranks,
    });

    await context.connection.receive(hello());

    expect(context.sent.map((frame) => ("t" in frame ? frame.t : "snapshot"))).toEqual([
      "welcome",
      "snapshot",
    ]);
    expect(context.scoreboardReads).toEqual([]);
    expect(context.closed).toEqual([]);
  });

  // Refuse sur une archive chaque écriture et chaque liste par `canvas_archived`, sans fermer ni toucher au noyau
  it("refuses on an archive every write and every list with canvas_archived, without closing nor touching the core", async () => {
    const context = setup({ session: owner, archivedAt });
    await context.connection.receive(hello());

    for (const frame of Object.values(frames)) {
      await context.connection.receive(JSON.stringify(frame));
      expect(context.sent.at(-1)).toEqual({
        t: "error",
        code: "canvas_archived",
        requestId: frame.requestId,
      });
    }

    expect(context.closed).toEqual([]);
    expect([
      context.placements,
      context.claims,
      context.moderations,
      context.namedModerators,
      context.reports,
      context.obsDelays,
      context.obsBackgrounds,
      context.gaugeLimits,
      context.listedPixels,
    ]).toEqual([[], [], [], [], [], [], [], [], []]);
  });

  // Laisse l'inspection et le ping : une archive se regarde, et la connexion reste en vie
  it("keeps inspection and ping: an archive can be looked at, and the connection stays alive", async () => {
    const context = setup({ session: owner, archivedAt });
    await context.connection.receive(hello());

    await context.connection.receive(inspect(1, 2));
    await context.connection.receive(JSON.stringify({ t: "ping" }));

    expect(context.sent.at(-2)).toMatchObject({ t: "inspected", x: 1, y: 2, entry: { login: "user2" } });
    expect(context.sent.at(-1)).toEqual({ t: "pong" });
  });

  // Laisse le suivi d'activité du développeur : il ne touche pas au canvas, et l'archive qu'il regarde y figure
  it("keeps the activity of the developer, which does not touch the canvas, and lists the archive in it", async () => {
    const { connection, sent, activity } = setup({ session: developer, archivedAt });
    await connection.receive(hello());

    await connection.receive(JSON.stringify({ t: "watchActivity", isWatching: true }));
    await connection.receive(
      JSON.stringify({ t: "listActivityHistory", requestId: "history-1", period: "day" }),
    );
    await activity.tick();

    expect(sent.some((frame) => "t" in frame && frame.t === "error")).toBe(false);
    expect(sent.at(-2)).toEqual({ t: "activityHistory", requestId: "history-1", points: [] });
    expect(sent.at(-1)).toMatchObject({ t: "activity", canvases: [{ canvasId }] });
  });

  // Une inspection d'archive ne donne ni l'identifiant de l'auteur, ni le droit de signaler, ni l'origine du modérateur
  it("gives an archive inspection no author id, no right to report and no moderator origin, whoever looks", async () => {
    const asOwner = setup({ session: owner, archivedAt, isModerator: true });
    const asViewer = setup({ archivedAt });
    for (const { connection } of [asOwner, asViewer]) {
      await connection.receive(hello());
      await connection.receive(inspect(1, 2));
    }

    for (const { sent } of [asOwner, asViewer])
      expect(sent.at(-1)).toEqual({ t: "inspected", requestId: "inspect-1", x: 1, y: 2, entry: publicEntry });
  });

  // Suit le statut : archivé, la connexion n'accepte plus d'écriture ; redevenu actif, elle les accepte de nouveau
  it("follows the status: archived, the connection accepts no write; active again, it accepts them again", async () => {
    const context = setup();
    await context.connection.receive(hello());

    context.control({ t: "canvasStatus", status: "archived" });
    await context.connection.receive(place());
    const whileArchived = [...context.placements];
    context.control({ t: "canvasStatus", status: "active" });
    await context.connection.receive(place());

    expect(context.sent.at(-3)).toEqual({ t: "error", code: "canvas_archived", requestId: ack.requestId });
    expect(whileArchived).toEqual([]);
    expect(context.sent.at(-1)).toEqual(ack);
    expect(context.placements).toHaveLength(1);
  });

  // Un statut « archivé » tombé pendant l'arrivée vaut aussi pour la suite : le `welcome` lu avant disait actif
  it("lets an archived status landing during the arrival count afterwards: the welcome read before said active", async () => {
    const during: { run?: () => void } = {};
    const context = setup({ duringSnapshot: () => during.run?.() });
    during.run = () => context.control({ t: "canvasStatus", status: "archived" });
    await context.connection.receive(hello());

    await context.connection.receive(place());

    expect(context.sent.at(-1)).toEqual({ t: "error", code: "canvas_archived", requestId: ack.requestId });
    expect(context.placements).toEqual([]);
  });

  // Rend à la page l'archivage qu'un script lui apprend (une course avec l'archivage), puis refuse le reste sans le noyau
  describe("when a script refuses, a race with the archiving", () => {
    for (const name of [
      "place",
      "claimGauge",
      "moderate",
      "setModerator",
      "report",
      "resizeCanvas",
    ] as const) {
      // Le noyau dit `canvas_archived` : la page l'apprend par l'erreur de sa requête, sans fermeture
      it(`hands ${name} to the page as canvas_archived, without closing, and refuses the next write without the core`, async () => {
        const context = setup({ session: owner, isRefusedByScripts: true });
        await context.connection.receive(hello());
        const frame = frames[name];

        await context.connection.receive(JSON.stringify(frame));
        const callsAfterFirst = context.placements.length;
        await context.connection.receive(place());

        expect(context.sent.at(-2)).toEqual({
          t: "error",
          code: "canvas_archived",
          requestId: frame.requestId,
        });
        expect(context.sent.at(-1)).toEqual({
          t: "error",
          code: "canvas_archived",
          requestId: ack.requestId,
        });
        expect(context.placements).toHaveLength(callsAfterFirst);
        expect(context.closed).toEqual([]);
      });
    }
  });

  // Ne relit pas le rôle sur une archive : plus personne n'y modère
  it("does not re-read the role on an archive: nobody moderates there any more", async () => {
    const context = setup({ archivedAt });
    await context.connection.receive(hello());

    context.roles.isModerator = true;
    context.control({ t: "role", userId: session.userId });
    await flush();

    expect(context.sent.filter((frame) => "t" in frame && frame.t === "role")).toEqual([]);
  });
});

describe("the activity in the connection (écart §4.2, JOURNAL 2026-10-06)", () => {
  const watch = JSON.stringify({ t: "watchActivity", isWatching: true });
  const listHistory = JSON.stringify({ t: "listActivityHistory", requestId: "history-1", period: "day" });

  // Ignore les frames d'activité d'une session qui n'est pas celle du développeur, et d'un invité, sans fermer
  it("ignores the activity frames of a session that is not the developer's, without closing", async () => {
    for (const opened of [setup(), setup({ session: null })]) {
      await opened.connection.receive(hello());
      const before = opened.sent.length;

      await opened.connection.receive(watch);
      await opened.connection.receive(listHistory);

      expect(opened.sent).toHaveLength(before);
      expect(opened.closed).toEqual([]);
    }
  });

  // Rend l'historique au développeur, avec sa requête
  it("answers the history to the developer, with its request", async () => {
    const { connection, sent } = setup({ session: developer });
    await connection.receive(hello());

    await connection.receive(listHistory);

    expect(sent.at(-1)).toEqual({ t: "activityHistory", requestId: "history-1", points: [] });
  });

  // Met la page dans l'activité au hello, avec son appareil et ses pixels acceptés, et l'en retire à sa fermeture
  it("puts the page in the activity at hello, with its device and accepted pixels, and takes it out at close", async () => {
    const context = setup();
    const watcher = context.open(developer, "phone");
    await watcher.connection.receive(hello());
    await watcher.connection.receive(watch);
    await context.connection.receive(hello());

    await context.connection.receive(place());
    await context.activity.tick();
    const during = watcher.sent.at(-1);
    await context.connection.close();
    await context.activity.tick();
    const after = watcher.sent.at(-1);

    expect(during).toMatchObject({ t: "activity", now: { people: 2, pixels: ack.accepted } });
    const accounts = during && "t" in during && during.t === "activity" ? during.canvases[0]?.accounts : [];
    expect(accounts?.map(({ userId, devices }) => [userId, devices])).toEqual([
      [DEVELOPER_USER_ID, ["phone"]],
      [session.userId, ["desktop"]],
    ]);
    expect(after).toMatchObject({ t: "activity", now: { people: 1 } });
  });

  // Ne lui envoie plus rien une fois sa page fermée
  it("sends the developer nothing more once his page is closed", async () => {
    const { activity, connection, sent } = setup({ session: developer });
    await connection.receive(hello());
    await connection.receive(watch);
    await activity.tick();
    const count = sent.length;

    await connection.close();
    await activity.tick();

    expect(sent).toHaveLength(count);
    expect(sent.at(-1)).toMatchObject({ t: "activity" });
  });
});

describe("the scoreboard of a canvas, for each page (JOURNAL 2026-10-06)", () => {
  const top: ScoreboardEntry[] = [
    { login: "ada", displayName: "Ada", pixels: 9 },
    { login: "bob", displayName: "Bob", pixels: 4 },
  ];
  const placed = new Map([[session.userId, { rank: 7, pixels: 2 }]]);

  const kinds = (sent: (ServerFrame | { snapshot: Uint8Array })[]) =>
    sent.map((frame) => ("t" in frame ? frame.t : "snapshot"));

  // Envoie à un connecté le top et sa place, juste après le snapshot
  it("sends a signed-in page the top and its place, right after the snapshot", async () => {
    const { connection, sent } = setup({ scoreboard: top, ranks: placed });

    await connection.receive(hello());

    expect(kinds(sent)).toEqual(["welcome", "snapshot", "scoreboard"]);
    expect(sent.at(-1)).toEqual({ t: "scoreboard", top, you: { rank: 7, pixels: 2 } });
  });

  // N'envoie que le top à un invité, et pas de place à un connecté qui n'a rien posé ou qui est banni
  it("sends the top alone to a guest, and no place to a signed-in page that placed nothing or is banned", async () => {
    const guest = setup({ session: null, scoreboard: top, ranks: placed });
    const withoutPlace = setup({ scoreboard: top });

    await guest.connection.receive(hello());
    await withoutPlace.connection.receive(hello());

    expect(guest.sent.at(-1)).toEqual({ t: "scoreboard", top });
    expect(withoutPlace.sent.at(-1)).toEqual({ t: "scoreboard", top });
  });

  // N'envoie rien à une page qui arrive sur un canvas où personne n'a posé
  it("sends nothing to a page arriving on a canvas where nobody placed", async () => {
    const { connection, sent } = setup();

    await connection.receive(hello());

    expect(kinds(sent)).toEqual(["welcome", "snapshot"]);
  });

  // Ne dit rien du classement à une vue OBS, ni à l'arrivée ni ensuite
  it("says nothing of the scoreboard to an OBS view, neither on arrival nor later", async () => {
    const { connection, sent, publish, broadcast } = setup({ session: null, scoreboard: top });

    await connection.receive(hello({ mode: "obs" }));
    publish(event(1, 1, 5));
    await broadcast.tickScoreboard();

    expect(kinds(sent)).toEqual(["welcome", "snapshot"]);
  });

  // Passe à une page prête ce qu'une fenêtre du classement lui envoie, sa place comprise
  it("passes a ready page what a scoreboard window sends it, its place included", async () => {
    const options: SetupOptions = { scoreboard: top, ranks: placed };
    const { connection, sent, publish, broadcast } = setup(options);
    await connection.receive(hello());

    options.scoreboard = [{ login: "eve", displayName: "Eve", pixels: 12 }, ...top];
    options.ranks = new Map([[session.userId, { rank: 8, pixels: 2 }]]);
    publish(event(1, 1, 5));
    await broadcast.tickScoreboard();

    expect(sent.at(-1)).toEqual({
      t: "scoreboard",
      top: options.scoreboard,
      you: { rank: 8, pixels: 2 },
    });
  });
});
