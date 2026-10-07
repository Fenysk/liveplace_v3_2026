import {
  type ActivityPeriod,
  type CanvasMeta,
  DEVELOPER_USER_ID,
  defaultCanvasMeta,
  HOUR_MS,
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
  CanvasActivityPoint,
  CanvasAudience,
  CanvasPixelsMinute,
  ClientSocket,
  DaySignups,
  TwitchLive,
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

const noCanvasAudience = { visits: 0, phoneVisits: 0, visitMinutes: 0, activePlayers: 0, signups: 0 };

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
  canvasAudience?: CanvasAudience; // ce que rend `getCanvasAudience`, sans la minute en cours
  canvasPoints?: CanvasActivityPoint[]; // ce que rend `listCanvasHistory`
  lives?: Record<string, TwitchLive>; // le live de chaque streamer, par `listTwitchLives` (Écart §4, JOURNAL 2026-10-07)
};

const setup = (options: SetupOptions = {}) => {
  const clock = { nowMs: now };
  const stored: ActivityMinute[] = [];
  const prunedAt: number[] = [];
  const prunedCanvasIds: string[][] = [];
  const userReads: string[] = [];
  const liveReads: string[][] = []; // les streamers dont le live a été lu : une entrée par lecture groupée
  const signupReads: number[] = [];
  const audienceReads: ActiveIds[] = []; // les identifiants que la minute en cours a donnés à chaque lecture
  const canvasAudienceReads: { canvasId: string; playerIds: Set<string> }[] = [];
  const canvasHistoryReads: { canvasId: string; period: ActivityPeriod }[] = [];
  const store: ActivityStore = {
    async storeActivityMinute(minute) {
      stored.push(minute);
    },
    async pruneActivity(nowMs, canvasIds = []) {
      prunedAt.push(nowMs);
      prunedCanvasIds.push([...canvasIds]);
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
    async listCanvasHistory(canvasId, period) {
      canvasHistoryReads.push({ canvasId, period });
      return options.canvasPoints ?? [];
    },
    async getCanvasAudience(canvasId, _nowMs, openedPlayerIds) {
      canvasAudienceReads.push({ canvasId, playerIds: new Set(openedPlayerIds) });
      return options.canvasAudience ?? { today: noCanvasAudience, month: noCanvasAudience };
    },
    async getUser(userId) {
      userReads.push(userId);
      return { userId, login: `login-${userId}`, displayName: `Name ${userId}` };
    },
  };
  const activity = createActivity({
    store,
    core: {
      getCanvas: async (canvasId) => metas.get(canvasId) ?? null,
      listTwitchLives: async (userIds) => {
        liveReads.push([...userIds]);
        return new Map(
          userIds.flatMap((userId) => {
            const live = options.lives?.[userId];
            return live ? [[userId, live] as const] : [];
          }),
        );
      },
    },
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

  // Ce que reçoit le développeur au prochain tic : il regarde depuis une socket à lui, sur `canvasId` s'il en a un.
  const watched = async (canvasId?: string): Promise<ActivityFrame> => {
    const { socket, sent } = openSocket();
    activity.watch(socket, developer, true, canvasId);
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
    prunedCanvasIds,
    userReads,
    liveReads,
    signupReads,
    audienceReads,
    canvasAudienceReads,
    canvasHistoryReads,
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
      stored.map(
        ({ pixelsByCanvas, canvases, accountIds, playerIds, streamedCanvasIds, ...counts }) => counts,
      ),
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

    expect((await activity.listHistory(developer, "day", "canvas-a"))?.points).toHaveLength(1);
    expect(await activity.listHistory(viewer, "day", "canvas-a")).toBeNull();
    expect(await activity.listHistory(null, "day", "canvas-a")).toBeNull();
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

describe("the canvas of the socket in the gateway (JOURNAL 2026-10-07)", () => {
  const savedCanvas = {
    today: { visits: 10, phoneVisits: 4, visitMinutes: 50, activePlayers: 3, signups: 2 },
    month: { visits: 100, phoneVisits: 40, visitMinutes: 500, activePlayers: 20, signups: 9 },
  };
  const nothing = { people: 0, obsViews: 0, pixels: 0, visits: 0, phoneVisits: 0, visitMinutes: 0 };
  const nobody = new Set<string>();

  // Dit du canvas de la socket son streamer, ses vues OBS, ses personnes dont les invités, sa température et ses comptes connectés
  it("tells the canvas of the socket: its owner, OBS views, people with the guests, heat and connected accounts", async () => {
    const { activity, join, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", null);
    join("canvas-a", null, { mode: "obs" });
    join("canvas-b", other);
    activity.countPixels("canvas-a", viewer.userId, 4);

    const { here, canvases } = await watched("canvas-a");

    expect(here).toMatchObject({
      canvasId: "canvas-a",
      owner: { userId: "owner-a", login: "login-owner-a", displayName: "Name owner-a" },
      obsViews: 1,
      people: 2,
      guests: 1,
      heat: 4,
      pixels: 4,
    });
    expect(here?.accounts.map(({ userId, role }) => [userId, role])).toEqual([[viewer.userId, "viewer"]]);
    expect(here).not.toHaveProperty("signups");
    expect(canvases).toHaveLength(2);
  });

  // Envoie la même frame aux sockets d'un même canvas, une autre à celles d'un autre, et la frame d'avant à une socket sans canvas
  it("sends the same frame to the sockets of one canvas, another to another's, and the plain one to a socket without canvas", async () => {
    const { activity, join, openSocket } = setup();
    join("canvas-a", viewer);
    const [first, second, elsewhere, without] = [openSocket(), openSocket(), openSocket(), openSocket()];
    activity.watch(first.socket, developer, true, "canvas-a");
    activity.watch(second.socket, developer, true, "canvas-a");
    activity.watch(elsewhere.socket, developer, true, "canvas-b");
    activity.watch(without.socket, developer, true);

    await activity.tick();

    expect(first.sent[0]).toBe(second.sent[0]);
    expect(elsewhere.sent[0]).not.toBe(first.sent[0]);
    expect(first.sent[0]).toMatchObject({ here: { canvasId: "canvas-a" } });
    expect(elsewhere.sent[0]).toMatchObject({ here: { canvasId: "canvas-b" } });
    expect(without.sent[0]).toMatchObject({ t: "activity" });
    expect(without.sent[0]).not.toHaveProperty("here");
  });

  // Laisse `here` absent d'un canvas que le noyau ne connaît pas
  it("leaves `here` out for a canvas the core does not know", async () => {
    const { join, watched, canvasAudienceReads } = setup();
    join("canvas-a", viewer);

    const frame = await watched("canvas-unknown");

    expect(frame).not.toHaveProperty("here");
    expect(frame.canvases).toHaveLength(1);
    expect(canvasAudienceReads).toEqual([]);
  });

  // Compte les pixels de la dernière minute canvas par canvas, glissants, et les oublie une minute après
  it("counts the pixels of the last minute canvas by canvas, sliding, and forgets them a minute later", async () => {
    const { activity, clock, watched } = setup();
    activity.countPixels("canvas-a", viewer.userId, 4);
    clock.nowMs += 30_000;
    activity.countPixels("canvas-a", viewer.userId, 6);
    activity.countPixels("canvas-b", other.userId, 1);

    expect((await watched("canvas-a")).here?.pixels).toBe(10);
    expect((await watched("canvas-b")).here?.pixels).toBe(1);
    clock.nowMs += 31_000;
    expect((await watched("canvas-a")).here?.pixels).toBe(6);
    clock.nowMs += 2 * MINUTE_MS;
    expect((await watched("canvas-a")).here?.pixels).toBe(0);
  });

  // Ajoute à l'audience gardée du canvas ce que sa minute en cours a vu, sans les visites d'un autre canvas, et passe ses joueurs au noyau
  it("adds what the minute in progress has seen to the saved audience of the canvas, without another canvas's visits, and gives the store its players", async () => {
    const { activity, join, watched, canvasAudienceReads } = setup({ canvasAudience: savedCanvas });
    join("canvas-a", viewer, { device: "phone" });
    join("canvas-b", other);
    join("canvas-a", null, { mode: "obs" });
    join("canvas-a", other, { isResumed: true });
    activity.countPixels("canvas-a", viewer.userId, 3);
    activity.countPixels("canvas-b", other.userId, 1);

    const { here } = await watched("canvas-a");

    expect(here?.audience.today).toEqual({ ...savedCanvas.today, visits: 11, phoneVisits: 5 });
    expect(here?.audience.month).toEqual({ ...savedCanvas.month, visits: 101, phoneVisits: 41 });
    expect(canvasAudienceReads).toEqual([{ canvasId: "canvas-a", playerIds: new Set([viewer.userId]) }]);
  });

  // N'écrit à la minute que les canvas où elle a eu quelque chose : des personnes, une vue OBS, un pixel ou une visite
  it("writes at the minute only the canvases it had something for: people, an OBS view, a pixel or a visit", async () => {
    const { activity, clock, join, stored } = setup();
    join("canvas-a", viewer, { device: "phone" });
    join("canvas-b", null, { mode: "obs" });
    activity.countPixels("canvas-c", "user-3", 5);

    clock.nowMs = minuteAt + MINUTE_MS + 1000;
    await activity.tick();

    const [first] = stored;
    expect([...(first?.canvases.keys() ?? [])].sort()).toEqual(["canvas-a", "canvas-b", "canvas-c"]);
    expect(first?.canvases.get("canvas-a")).toEqual({
      ...nothing,
      people: 1,
      visits: 1,
      phoneVisits: 1,
      playerIds: nobody,
    });
    expect(first?.canvases.get("canvas-b")).toEqual({ ...nothing, obsViews: 1, playerIds: nobody });
    expect(first?.canvases.get("canvas-c")).toEqual({
      ...nothing,
      pixels: 5,
      playerIds: new Set(["user-3"]),
    });
  });

  // Reporte les personnes d'un canvas d'une minute à l'autre, et cesse de l'écrire une fois sa dernière page fermée
  it("carries the people of a canvas from one minute to the next, and stops writing it once its last page is closed", async () => {
    const { activity, clock, join, stored } = setup();
    const page = join("canvas-a", viewer);
    const tickAt = async (nowMs: number) => {
      clock.nowMs = nowMs;
      await activity.tick();
    };

    await tickAt(minuteAt + MINUTE_MS + 1000);
    await tickAt(minuteAt + 2 * MINUTE_MS + 1000);
    page.leave();
    await tickAt(minuteAt + 3 * MINUTE_MS + 1000);
    await tickAt(minuteAt + 4 * MINUTE_MS + 1000);

    const written = stored.map(({ canvases }) => canvases.get("canvas-a"));
    expect(written.map((canvas) => canvas?.people)).toEqual([1, 1, 1, undefined]);
    expect(written.map((canvas) => canvas?.visits)).toEqual([1, 0, 0, undefined]);
  });

  // Garde le pic des personnes d'un canvas, un compte une fois quels que soient ses onglets, et somme ses visites
  it("keeps the peak of the people of a canvas, an account once whatever its tabs, and sums its visits", async () => {
    const { clock, join, stored, activity } = setup();
    join("canvas-a", viewer);
    join("canvas-a", viewer, { device: "phone" });
    const guest = join("canvas-a", null);
    join("canvas-a", other);
    guest.leave();
    join("canvas-b", other);

    clock.nowMs = minuteAt + MINUTE_MS + 1000;
    await activity.tick();

    expect(stored[0]?.canvases.get("canvas-a")).toEqual({
      ...nothing,
      people: 3,
      visits: 4,
      phoneVisits: 1,
      visitMinutes: 2,
      playerIds: nobody,
    });
    expect(stored[0]?.canvases.get("canvas-b")).toMatchObject({ people: 1, visits: 1 });
  });

  // Compte le temps passé d'un canvas en pages ouvertes fois la durée écoulée, sans perdre une seconde d'une minute à l'autre
  it("counts the time spent on a canvas as its open pages times the time gone by, losing no second from one minute to the next", async () => {
    const { activity, clock, join, stored, watched } = setup();
    join("canvas-a", viewer);
    join("canvas-a", null);
    join("canvas-b", other);

    for (let minutes = 0; minutes < 5; minutes += 1) {
      clock.nowMs += MINUTE_MS;
      await activity.tick();
    }

    const spent = (canvasId: string) =>
      stored.reduce((sum, { canvases }) => sum + (canvases.get(canvasId)?.visitMinutes ?? 0), 0);
    const opened = async (canvasId: string) =>
      (await watched(canvasId)).here?.audience.today.visitMinutes ?? 0;
    expect(spent("canvas-a") + (await opened("canvas-a"))).toBe(10);
    expect(spent("canvas-b") + (await opened("canvas-b"))).toBe(5);
  });

  // Garde les secondes d'un canvas dont les pages partent avant la minute : trois pages de 20 secondes font une minute
  it("keeps the seconds of a canvas whose pages leave before the minute: three pages of 20 seconds make one", async () => {
    const { clock, join, watched } = setup();
    for (const session of [viewer, null, other]) {
      const page = join("canvas-a", session);
      clock.nowMs += 20_000;
      page.leave();
    }

    expect((await watched("canvas-a")).here?.audience.today.visitMinutes).toBe(1);
  });

  // Ne compte pas, en production, les pages ni les pixels du développeur dans les chiffres du canvas, et le garde dans ses comptes
  it("in production, leaves the developer's pages and pixels out of the numbers of the canvas, and keeps him in its accounts", async () => {
    const { activity, clock, join, stored, watched, canvasAudienceReads } = setup({ isProduction: true });
    join("canvas-a", developer, { role: "owner", device: "phone" });
    join("canvas-a", developer, { role: "owner", mode: "obs" });
    activity.countPixels("canvas-a", DEVELOPER_USER_ID, 9);

    const { here } = await watched("canvas-a");
    clock.nowMs = minuteAt + MINUTE_MS + 1000;
    await activity.tick();

    expect(here).toMatchObject({
      obsViews: 0,
      people: 0,
      heat: 0,
      pixels: 0,
      accounts: [{ userId: DEVELOPER_USER_ID }],
      audience: { today: noCanvasAudience, month: noCanvasAudience },
    });
    expect(canvasAudienceReads.at(-1)?.playerIds).toEqual(nobody);
    expect(stored[0]?.canvases.size).toBe(0);
  });

  // Ailleurs, sur le poste et les bêtas, il compte comme tout le monde dans les chiffres du canvas
  it("elsewhere, counts the developer like anyone in the numbers of the canvas", async () => {
    const { activity, join, watched, canvasAudienceReads } = setup();
    join("canvas-a", developer, { role: "owner" });
    activity.countPixels("canvas-a", DEVELOPER_USER_ID, 2);

    const { here } = await watched("canvas-a");

    expect(here).toMatchObject({ people: 1, pixels: 2, audience: { today: { visits: 1 } } });
    expect(canvasAudienceReads.at(-1)?.playerIds).toEqual(new Set([DEVELOPER_USER_ID]));
  });

  // Rend au développeur seul l'historique du canvas de sa socket, avec celui de tout LivePlace
  it("gives the history of the socket's canvas, with the whole one, to the developer only", async () => {
    const canvasPoints = [
      { at: minuteAt, people: 1, obsViews: 0, pixels: 2, visits: 1, visitMinutes: 3, signups: 0 },
    ];
    const { activity, canvasHistoryReads } = setup({ canvasPoints });

    expect(await activity.listHistory(developer, "month", "canvas-a")).toEqual({ points: [], canvasPoints });
    expect(await activity.listHistory(viewer, "day", "canvas-a")).toBeNull();
    expect(await activity.listHistory(null, "day", "canvas-a")).toBeNull();
    expect(canvasHistoryReads).toEqual([{ canvasId: "canvas-a", period: "month" }]);
  });

  // Élague aussi les canvas écrits depuis le dernier élagage, à chaque heure, puis les oublie
  it("also prunes the canvases written since the last pruning, every hour, then forgets them", async () => {
    const { activity, clock, join, prunedCanvasIds } = setup();
    const page = join("canvas-a", viewer);
    const nextHour = toActivityPointStarts(now).hour + HOUR_MS;
    const tickAt = async (nowMs: number) => {
      clock.nowMs = nowMs;
      await activity.tick();
    };

    await activity.start();
    await tickAt(minuteAt + MINUTE_MS + 1000);
    page.leave();
    await tickAt(nextHour + 1000);
    await tickAt(nextHour + MINUTE_MS + 1000);
    await tickAt(nextHour + HOUR_MS + 1000);

    expect(prunedCanvasIds).toEqual([[], ["canvas-a"], []]);
  });
});

describe("the Twitch live of the owners in the activity (Écart §4, JOURNAL 2026-10-07)", () => {
  const art: TwitchLive = { category: "Art" };

  // Joint à chaque canvas listé le live de son streamer, en une seule lecture pour toutes les cartes, et relit à chaque frame
  it("joins the live of each listed owner in a single read for all the cards, read again at each frame", async () => {
    const lives: Record<string, TwitchLive> = { "owner-a": art, "owner-b": { category: "" } };
    const { join, watched, liveReads } = setup({ lives });
    join("canvas-a", viewer);
    join("canvas-b", viewer);
    join("canvas-c", viewer);

    const first = await watched();

    const ownerOf = (canvasId: string) =>
      first.canvases.find((canvas) => canvas.canvasId === canvasId)?.owner;
    expect(ownerOf("canvas-a")).toMatchObject({ userId: "owner-a", twitchLive: art });
    expect(ownerOf("canvas-b")).toMatchObject({ twitchLive: { category: "" } });
    expect(ownerOf("canvas-c")).not.toHaveProperty("twitchLive");
    expect(liveReads).toEqual([["owner-a", "owner-b", "owner-c"]]);

    delete lives["owner-a"];
    const second = await watched();
    expect(second.canvases.find(({ canvasId }) => canvasId === "canvas-a")?.owner).not.toHaveProperty(
      "twitchLive",
    );
  });

  // Ne joint le live à aucun compte connecté : seul le streamer de la carte le porte
  it("joins the live to no connected account: only the card's owner carries it", async () => {
    const { join, watched } = setup({ lives: { "user-1": art, "owner-a": art } });
    join("canvas-a", viewer);

    const { canvases } = await watched();

    expect(canvases[0]?.accounts[0]).toMatchObject({ userId: viewer.userId });
    expect(canvases[0]?.accounts[0]).not.toHaveProperty("twitchLive");
    expect(canvases[0]?.owner).toHaveProperty("twitchLive");
  });

  // Le canvas de la socket du développeur a aussi son streamer en live, listé ou non (un canvas où personne n'est se lit à part)
  it("tells the live of the owner of the developer's own canvas, listed or not", async () => {
    const { join, watched, liveReads } = setup({ lives: { "owner-a": art, "owner-b": art } });
    join("canvas-a", viewer);

    const listed = await watched("canvas-a");
    const alone = await watched("canvas-b");

    expect(listed.here?.owner).toMatchObject({ userId: "owner-a", twitchLive: art });
    expect(alone.here?.owner).toMatchObject({ userId: "owner-b", twitchLive: art });
    expect(liveReads).toEqual([["owner-a"], ["owner-a"], ["owner-b"]]);
  });
});
