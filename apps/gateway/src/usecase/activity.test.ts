import {
  type CanvasMeta,
  DEVELOPER_USER_ID,
  defaultCanvasMeta,
  MINUTE_MS,
  type Session,
  toActivityPointStarts,
} from "@liveplace/domain";
import type {
  ActivityFrame,
  ActivityMinute,
  ActivityStore,
  CanvasPixelsMinute,
  ClientSocket,
  DaySignups,
} from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { type ActivityPage, createActivity } from "./activity";

const now = Date.UTC(2026, 9, 6, 12, 30, 15);
const minuteAt = toActivityPointStarts(now).minute;

const developer: Session = { userId: DEVELOPER_USER_ID, login: "fenysk", displayName: "Fenysk" };
const viewer: Session = {
  userId: "user-1",
  login: "user1",
  displayName: "User 1",
  avatarUrl: "https://avatar",
};
const other: Session = { userId: "user-2", login: "user2", displayName: "User 2" };

// Les canvas connus du noyau : le streamer d'un canvas qui n'a plus que sa température se lit dans `meta`.
const metas = new Map<string, CanvasMeta>([
  ["canvas-a", defaultCanvasMeta("owner-a")],
  ["canvas-b", defaultCanvasMeta("owner-b")],
  ["canvas-c", defaultCanvasMeta("owner-c")],
]);

type SetupOptions = {
  isProduction?: boolean;
  pastMinutes?: CanvasPixelsMinute[]; // ce que rend `listCanvasPixels` au démarrage
  signups?: DaySignups;
};

const setup = (options: SetupOptions = {}) => {
  const clock = { nowMs: now };
  const stored: ActivityMinute[] = [];
  const prunedAt: number[] = [];
  const userReads: string[] = [];
  const signupReads: number[] = [];
  const store: ActivityStore = {
    async storeActivityMinute(minute) {
      stored.push(minute);
    },
    async pruneActivity(nowMs) {
      prunedAt.push(nowMs);
    },
    async listActivityHistory(period) {
      return period === "day" ? [{ at: minuteAt, people: 1, streamed: 0, pixels: 2, signups: 0 }] : [];
    },
    async listCanvasPixels() {
      return options.pastMinutes ?? [];
    },
    async getDaySignups(nowMs) {
      signupReads.push(nowMs);
      return options.signups ?? { total: 0, byDiscoveredViaUserId: new Map() };
    },
    async getUser(userId) {
      userReads.push(userId);
      return { userId, login: `login-${userId}`, displayName: `Name ${userId}` };
    },
  };
  const activity = createActivity({
    store,
    core: { getCanvas: async (canvasId) => metas.get(canvasId) ?? null },
    now: () => clock.nowMs,
    isProduction: options.isProduction ?? false,
  });

  const join = (canvasId: string, session: Session | null, overrides: Partial<ActivityPage> = {}) =>
    activity.join({
      canvasId,
      ownerId: metas.get(canvasId)?.ownerId ?? "owner-a",
      mode: "ui",
      session,
      role: session ? "viewer" : "guest",
      device: "desktop",
      ...overrides,
    });

  const openSocket = () => {
    const sent: ServerFrame[] = [];
    const socket: ClientSocket = {
      sendFrame: (frame) => {
        sent.push(frame);
      },
      sendSnapshot: () => undefined,
      close: () => undefined,
    };
    return { socket, sent };
  };

  // Ce que reçoit le développeur au prochain tic : il regarde depuis une socket à lui.
  const watched = async (): Promise<ActivityFrame> => {
    const { socket, sent } = openSocket();
    activity.watch(socket, developer, true);
    await activity.tick();
    activity.watch(socket, developer, false);
    const frame = sent.at(-1);
    if (frame?.t !== "activity") throw new Error("aucune frame activity");
    return frame;
  };

  return { activity, clock, stored, prunedAt, userReads, signupReads, join, openSocket, watched };
};

describe("the activity in the gateway (écart §4.3, JOURNAL 2026-10-06)", () => {
  // Compte un compte une fois quels que soient ses onglets, un invité par onglet, et jamais une vue OBS
  it("counts an account once whatever its tabs, a guest per tab, and never an OBS view", async () => {
    const { join, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", viewer);
    join("canvas-b", viewer);
    join("canvas-a", null);
    join("canvas-a", null);
    join("canvas-b", null, { mode: "obs" });

    const { now: moment, canvases } = await watched();

    expect(moment).toMatchObject({ people: 3, guests: 2, streamed: 1 });
    expect(canvases.find(({ canvasId }) => canvasId === "canvas-a")).toMatchObject({
      people: 3,
      guests: 2,
      obsViews: 0,
    });
    expect(canvases.find(({ canvasId }) => canvasId === "canvas-b")).toMatchObject({
      people: 1,
      guests: 0,
      obsViews: 1,
    });
  });

  // Envoie l'activité à chaque tic aux seules sockets du développeur qui regardent, la même frame pour toutes
  it("sends the activity at each tick to the developer's watching sockets only, the same frame to all", async () => {
    const { activity, openSocket, signupReads } = setup();
    const first = openSocket();
    const second = openSocket();
    const stranger = openSocket();
    activity.watch(stranger.socket, viewer, true);
    activity.watch(stranger.socket, null, true);

    await activity.tick();
    expect(signupReads).toEqual([]);

    activity.watch(first.socket, developer, true);
    activity.watch(second.socket, developer, true);
    await activity.tick();

    expect(first.sent).toHaveLength(1);
    expect(first.sent[0]?.t).toBe("activity");
    expect(first.sent[0]).toBe(second.sent[0]);
    expect(stranger.sent).toEqual([]);

    activity.watch(first.socket, developer, false);
    await activity.tick();
    expect(first.sent).toHaveLength(1);
    expect(second.sent).toHaveLength(2);
  });

  // Montre les canvas où une personne est connectée, streamés, ou chauds, du plus chaud au plus froid puis par personnes
  it("shows the canvases with someone on them, streamed or hot, hottest first, then by people", async () => {
    const { activity, join, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", other);
    join("canvas-b", null, { mode: "obs" });
    activity.countPixels("canvas-c", "user-3", 5);
    join("canvas-b", null);

    const { canvases } = await watched();

    expect(canvases.map(({ canvasId, heat }) => [canvasId, heat])).toEqual([
      ["canvas-c", 5],
      ["canvas-a", 0],
      ["canvas-b", 0],
    ]);
    expect(canvases[0]).toMatchObject({
      owner: { userId: "owner-c", login: "login-owner-c", displayName: "Name owner-c" },
      people: 0,
      accounts: [],
    });
  });

  // Dit de chaque compte connecté son rôle, depuis sa plus ancienne page, ses appareils, sous chaque canvas où il est
  it("tells each connected account's role, since its oldest page, its devices, under each canvas it is on", async () => {
    const { clock, join, watched } = setup();
    join("canvas-a", viewer);
    clock.nowMs += 5 * MINUTE_MS;
    join("canvas-a", viewer, { device: "phone" });
    const onB = join("canvas-b", viewer, { device: "phone" });
    onB.setRole("moderator");

    const { canvases } = await watched();

    const { userId, login, displayName, avatarUrl } = viewer;
    expect(canvases.find(({ canvasId }) => canvasId === "canvas-a")?.accounts).toEqual([
      {
        userId,
        login,
        displayName,
        avatarUrl,
        role: "viewer",
        connectedAt: now,
        devices: ["desktop", "phone"],
      },
    ]);
    expect(canvases.find(({ canvasId }) => canvasId === "canvas-b")?.accounts).toEqual([
      {
        userId,
        login,
        displayName,
        avatarUrl,
        role: "moderator",
        connectedAt: clock.nowMs,
        devices: ["phone"],
      },
    ]);
  });

  // Oublie une page fermée : ni personne, ni compte, ni canvas
  it("forgets a closed page: no person, no account, no canvas", async () => {
    const { join, watched } = setup();
    const page = join("canvas-a", viewer);

    page.leave();
    page.leave();

    expect(await watched()).toEqual({
      t: "activity",
      now: { people: 0, guests: 0, streamed: 0, pixels: 0, signups: 0 },
      canvases: [],
    });
  });

  // Compte les pixels des 60 dernières secondes, glissantes, et les nouveaux comptes du jour, venus de chaque page
  it("counts the pixels of the last 60 sliding seconds, and the day's signups, from each page", async () => {
    const signups = { total: 3, byDiscoveredViaUserId: new Map([["owner-a", 2]]) };
    const { activity, clock, join, watched } = setup({ signups });
    join("canvas-a", viewer);
    activity.countPixels("canvas-a", viewer.userId, 4);
    clock.nowMs += 30_000;
    activity.countPixels("canvas-a", viewer.userId, 6);
    clock.nowMs += 31_000;

    const { now: moment, canvases } = await watched();

    expect(moment).toMatchObject({ pixels: 6, signups: 3 });
    expect(canvases[0]).toMatchObject({ canvasId: "canvas-a", heat: 10, signups: 2 });
  });

  // Écrit chaque minute écoulée, même à zéro : le pic des personnes et des canvas streamés, et ses pixels
  it("writes each minute gone by, even at zero: the peak of people and streamed canvases, and its pixels", async () => {
    const { activity, clock, join, stored } = setup();
    const guest = join("canvas-a", null);
    const obs = join("canvas-a", null, { mode: "obs" });
    const page = join("canvas-b", viewer);
    activity.countPixels("canvas-b", viewer.userId, 7);
    guest.leave();
    obs.leave();

    await activity.tick();
    expect(stored).toEqual([]);

    clock.nowMs = minuteAt + MINUTE_MS + 1000;
    page.leave();
    await activity.tick();
    clock.nowMs += MINUTE_MS;
    await activity.tick();
    clock.nowMs += MINUTE_MS;
    await activity.tick();

    expect(stored.map(({ pixelsByCanvas, ...counts }) => counts)).toEqual([
      { at: minuteAt, people: 2, streamed: 1, pixels: 7 },
      { at: minuteAt + MINUTE_MS, people: 1, streamed: 0, pixels: 0 },
      { at: minuteAt + 2 * MINUTE_MS, people: 0, streamed: 0, pixels: 0 },
    ]);
    expect(stored[0]?.pixelsByCanvas).toEqual(new Map([["canvas-b", 7]]));
  });

  // Reprend la température d'avant un redémarrage, et l'oublie une heure après
  it("takes back the heat from before a restart, and forgets it an hour later", async () => {
    const pastMinutes = [{ at: minuteAt - 10 * MINUTE_MS, pixelsByCanvas: new Map([["canvas-c", 40]]) }];
    const { activity, clock, watched } = setup({ pastMinutes });

    await activity.start();
    expect((await watched()).canvases).toMatchObject([{ canvasId: "canvas-c", heat: 40 }]);

    clock.nowMs = minuteAt + 50 * MINUTE_MS;
    expect((await watched()).canvases).toEqual([]);
  });

  // Élague l'historique au démarrage, puis à chaque heure
  it("prunes the history at start, then every hour", async () => {
    const { activity, clock, prunedAt } = setup();

    await activity.start();
    clock.nowMs = minuteAt + 10 * MINUTE_MS;
    await activity.tick();
    clock.nowMs = toActivityPointStarts(now).hour + 61 * MINUTE_MS;
    await activity.tick();

    expect(prunedAt).toEqual([now, clock.nowMs]);
  });

  // Lit le miroir du streamer une fois, puis le garde
  it("reads the owner's mirror once, then keeps it", async () => {
    const { join, userReads, watched } = setup();
    join("canvas-a", viewer);

    await watched();
    await watched();

    expect(userReads).toEqual(["owner-a"]);
  });

  // Ne rend l'historique qu'au développeur
  it("gives the history to the developer only", async () => {
    const { activity } = setup();

    expect(await activity.listHistory(developer, "day")).toHaveLength(1);
    expect(await activity.listHistory(viewer, "day")).toBeNull();
    expect(await activity.listHistory(null, "day")).toBeNull();
  });
});

describe("the developer in production (écart §10.3, JOURNAL 2026-10-06)", () => {
  // En production, ses pages et ses pixels sortent des chiffres et de l'historique, il reste dans la liste de son canvas
  it("in production, leaves his pages and pixels out of the numbers and the history, and keeps him listed", async () => {
    const { activity, clock, join, stored, watched } = setup({ isProduction: true });
    join("canvas-a", developer, { role: "owner" });
    join("canvas-a", developer, { mode: "obs" });
    activity.countPixels("canvas-a", DEVELOPER_USER_ID, 9);

    const { now: moment, canvases } = await watched();
    clock.nowMs = minuteAt + MINUTE_MS;
    await activity.tick();

    expect(moment).toEqual({ people: 0, guests: 0, streamed: 0, pixels: 0, signups: 0 });
    expect(canvases).toMatchObject([
      { canvasId: "canvas-a", people: 0, obsViews: 0, heat: 0, accounts: [{ userId: DEVELOPER_USER_ID }] },
    ]);
    expect(stored).toMatchObject([{ people: 0, streamed: 0, pixels: 0 }]);
  });

  // Ailleurs, sur le poste et les bêtas, il compte comme tout le monde
  it("elsewhere, on the workstation and the betas, counts him like anyone", async () => {
    const { activity, join, watched } = setup();
    join("canvas-a", developer, { role: "owner" });
    activity.countPixels("canvas-a", DEVELOPER_USER_ID, 9);

    expect((await watched()).now).toMatchObject({ people: 1, pixels: 9 });
  });
});
