import {
  type CanvasMeta,
  DEVELOPER_USER_ID,
  defaultCanvasMeta,
  MINUTE_MS,
  type Session,
  toActivityPointStarts,
} from "@liveplace/domain";
import type {
  ActiveIds,
  ActivityAudience,
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

const noAudience = {
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  activeAccounts: 0,
  activePlayers: 0,
  activeStreamers: 0,
};

const onceVisited = { ...noAudience, visits: 1 };

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
  audience?: ActivityAudience; // ce que rend `getAudience`, sans la minute en cours
};

const setup = (options: SetupOptions = {}) => {
  const clock = { nowMs: now };
  const stored: ActivityMinute[] = [];
  const prunedAt: number[] = [];
  const userReads: string[] = [];
  const signupReads: number[] = [];
  const audienceReads: ActiveIds[] = []; // les identifiants que la minute en cours a donnés à chaque lecture
  const store: ActivityStore = {
    async storeActivityMinute(minute) {
      stored.push(minute);
    },
    async pruneActivity(nowMs) {
      prunedAt.push(nowMs);
    },
    async listActivityHistory(period) {
      return period === "day"
        ? [
            {
              at: minuteAt,
              people: 1,
              streamed: 0,
              pixels: 2,
              signups: 0,
              visits: 0,
              phoneVisits: 0,
              visitMinutes: 0,
            },
          ]
        : [];
    },
    async listCanvasPixels() {
      return options.pastMinutes ?? [];
    },
    async getDaySignups(nowMs) {
      signupReads.push(nowMs);
      return options.signups ?? { total: 0, byDiscoveredViaUserId: new Map() };
    },
    async getAudience(_nowMs, opened) {
      audienceReads.push({
        accountIds: new Set(opened.accountIds),
        playerIds: new Set(opened.playerIds),
        streamedCanvasIds: new Set(opened.streamedCanvasIds),
      });
      return options.audience ?? { today: noAudience, month: noAudience };
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
      isResumed: false,
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

  return {
    activity,
    clock,
    stored,
    prunedAt,
    userReads,
    signupReads,
    audienceReads,
    join,
    openSocket,
    watched,
  };
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
      audience: { today: onceVisited, month: onceVisited },
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

    const unvisited = { visits: 0, phoneVisits: 0, visitMinutes: 0 };
    expect(
      stored.map(({ pixelsByCanvas, accountIds, playerIds, streamedCanvasIds, ...counts }) => counts),
    ).toEqual([
      { at: minuteAt, people: 2, streamed: 1, pixels: 7, ...unvisited, visits: 2 },
      { at: minuteAt + MINUTE_MS, people: 1, streamed: 0, pixels: 0, ...unvisited },
      { at: minuteAt + 2 * MINUTE_MS, people: 0, streamed: 0, pixels: 0, ...unvisited },
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

describe("the audience in the gateway (JOURNAL 2026-10-07)", () => {
  const saved = {
    today: {
      visits: 10,
      phoneVisits: 4,
      visitMinutes: 50,
      activeAccounts: 3,
      activePlayers: 2,
      activeStreamers: 1,
    },
    month: {
      visits: 100,
      phoneVisits: 40,
      visitMinutes: 500,
      activeAccounts: 30,
      activePlayers: 20,
      activeStreamers: 5,
    },
  };

  // Compte une visite par page du jeu ouverte, compte ou invité, jamais une vue OBS ni une reprise
  it("counts a visit for each game page opened, an account or a guest, never an OBS view nor a resumption", async () => {
    const { join, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", viewer);
    join("canvas-b", null);
    join("canvas-a", null, { mode: "obs" });
    join("canvas-a", other, { isResumed: true });

    const { audience } = await watched();

    expect(audience.today).toMatchObject({ visits: 3, phoneVisits: 0 });
    expect(audience.month).toMatchObject({ visits: 3, phoneVisits: 0 });
  });

  // Compte parmi les visites celles faites au téléphone, d'après l'appareil de la page
  it("counts among the visits those made on a phone, by the device of the page", async () => {
    const { join, watched } = setup();
    join("canvas-a", viewer, { device: "phone" });
    join("canvas-a", null);
    join("canvas-a", null, { device: "phone" });
    join("canvas-a", null, { device: "phone", mode: "obs" });

    expect((await watched()).audience.today).toMatchObject({ visits: 3, phoneVisits: 2 });
  });

  // Ajoute à l'audience gardée ce que la minute en cours a vu, aujourd'hui et sur 30 jours, sans toucher aux distincts
  it("adds what the minute in progress has seen to the saved audience, today and the month, leaving the distinct ones", async () => {
    const { join, watched } = setup({ audience: saved });
    join("canvas-a", viewer, { device: "phone" });

    const { audience } = await watched();

    expect(audience.today).toEqual({ ...saved.today, visits: 11, phoneVisits: 5 });
    expect(audience.month).toEqual({ ...saved.month, visits: 101, phoneVisits: 41 });
  });

  // Passe au noyau les identifiants de la minute en cours : comptes venus, joueurs ayant posé, canvas streamés
  it("gives the store the ids of the minute in progress: accounts that came, players who placed, streamed canvases", async () => {
    const { activity, join, audienceReads, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", null);
    join("canvas-b", null, { mode: "obs" });
    join("canvas-a", other, { isResumed: true });
    activity.countPixels("canvas-a", viewer.userId, 3);
    activity.countPixels("canvas-a", "user-3", 0);

    await watched();

    expect(audienceReads.at(-1)).toEqual({
      accountIds: new Set([viewer.userId]),
      playerIds: new Set([viewer.userId]),
      streamedCanvasIds: new Set(["canvas-b"]),
    });
  });

  // Ne lit ni n'écrit rien dans Redis pour une page ou une pose : seulement au tic, et à la lecture si quelqu'un regarde
  it("neither reads nor writes for a page or a placement: only at the tick, and at the read if someone watches", async () => {
    const { activity, join, audienceReads, stored: written, watched } = setup();
    for (let page = 0; page < 20; page += 1) join("canvas-a", viewer);
    for (let placement = 0; placement < 50; placement += 1)
      activity.countPixels("canvas-a", viewer.userId, 1);

    expect(audienceReads).toEqual([]);
    expect(written).toEqual([]);
    await activity.tick();
    expect(audienceReads).toEqual([]);
    await watched();
    expect(audienceReads).toHaveLength(1);
  });

  // Compte le temps passé en pages du jeu ouvertes fois la durée écoulée : deux pages une minute font deux minutes
  it("counts the time spent as the game pages open times the time gone by: two pages for a minute make two", async () => {
    const { activity, clock, join, stored: written, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-b", null);

    clock.nowMs += MINUTE_MS;
    await activity.tick();
    const { audience } = await watched();

    expect(written.map(({ visitMinutes }) => visitMinutes)).toEqual([1]);
    expect(audience.today.visitMinutes).toBe(1);
  });

  // Reporte les secondes d'une minute à l'autre : cinq minutes de deux pages font dix minutes, sans en perdre
  it("carries the seconds from one minute to the next: two pages for five minutes make ten, none lost", async () => {
    const { activity, clock, join, stored: written, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-b", null);

    for (let minutes = 0; minutes < 5; minutes += 1) {
      clock.nowMs += MINUTE_MS;
      await activity.tick();
    }
    const { audience } = await watched();

    const spent = written.reduce((sum, { visitMinutes }) => sum + visitMinutes, 0);
    expect(spent + audience.today.visitMinutes).toBe(10);
  });

  // Garde les secondes d'une page qui part avant la minute : trois pages de 20 secondes font une minute
  it("keeps the seconds of a page that leaves before the minute: three pages of 20 seconds make one", async () => {
    const { clock, join, watched } = setup();
    for (const device of ["desktop", "phone", "desktop"] as const) {
      const page = join("canvas-a", null, { device });
      clock.nowMs += 20_000;
      page.leave();
    }

    expect((await watched()).audience.today.visitMinutes).toBe(1);
  });

  // Compte le temps d'une page reprise, qui n'est pas une visite, et jamais celui d'une vue OBS
  it("counts the time of a resumed page, which is not a visit, and never that of an OBS view", async () => {
    const { clock, join, watched } = setup();
    join("canvas-a", viewer, { isResumed: true });
    join("canvas-a", null, { mode: "obs" });
    clock.nowMs += MINUTE_MS;

    expect((await watched()).audience.today).toMatchObject({ visits: 0, visitMinutes: 1 });
  });

  // Écrit chaque minute avec ses visites, son temps passé et ses identifiants, et reporte un canvas streamé encore ouvert
  it("writes each minute with its visits, its time spent and its ids, and carries a streamed canvas still open", async () => {
    const { activity, clock, join, stored: written } = setup();
    const obs = join("canvas-a", null, { mode: "obs" });
    join("canvas-a", viewer, { device: "phone" });
    activity.countPixels("canvas-a", viewer.userId, 2);

    clock.nowMs = minuteAt + MINUTE_MS;
    await activity.tick();
    clock.nowMs += MINUTE_MS;
    await activity.tick();
    clock.nowMs += 30_000;
    obs.leave();
    clock.nowMs += 30_000;
    await activity.tick();
    clock.nowMs += MINUTE_MS;
    await activity.tick();

    const [first, second, third, fourth] = written;
    expect(first).toMatchObject({ visits: 1, phoneVisits: 1, visitMinutes: 0 });
    expect([...(first?.accountIds ?? [])]).toEqual([viewer.userId]);
    expect([...(first?.playerIds ?? [])]).toEqual([viewer.userId]);
    expect([...(first?.streamedCanvasIds ?? [])]).toEqual(["canvas-a"]);
    expect(second).toMatchObject({ visits: 0, phoneVisits: 0 });
    expect([...(second?.accountIds ?? [])]).toEqual([]);
    expect([...(second?.playerIds ?? [])]).toEqual([]);
    expect([...(second?.streamedCanvasIds ?? [])]).toEqual(["canvas-a"]);
    expect([...(third?.streamedCanvasIds ?? [])]).toEqual(["canvas-a"]);
    expect([...(fourth?.streamedCanvasIds ?? [])]).toEqual([]);
  });

  // En production, laisse de côté les visites, le temps et les identifiants du développeur
  it("in production, leaves the developer's visits, time and ids out", async () => {
    const { clock, join, stored: written, audienceReads, watched } = setup({ isProduction: true });
    join("canvas-a", developer, { role: "owner", device: "phone" });
    join("canvas-a", developer, { role: "owner", mode: "obs" });
    clock.nowMs += MINUTE_MS;

    const { audience } = await watched();

    expect(audience.today).toEqual(noAudience);
    expect(audienceReads.at(-1)).toEqual({
      accountIds: new Set(),
      playerIds: new Set(),
      streamedCanvasIds: new Set(),
    });
    expect(written.map(({ visits, visitMinutes }) => [visits, visitMinutes])).toEqual([[0, 0]]);
  });

  // Ailleurs, sur le poste et les bêtas, il compte comme tout le monde
  it("elsewhere, counts the developer like anyone: his visits and his ids", async () => {
    const { activity, join, audienceReads, watched } = setup();
    join("canvas-a", developer, { role: "owner" });
    activity.countPixels("canvas-a", DEVELOPER_USER_ID, 1);

    expect((await watched()).audience.today).toMatchObject({ visits: 1 });
    expect(audienceReads.at(-1)?.accountIds).toEqual(new Set([DEVELOPER_USER_ID]));
    expect(audienceReads.at(-1)?.playerIds).toEqual(new Set([DEVELOPER_USER_ID]));
  });
});
