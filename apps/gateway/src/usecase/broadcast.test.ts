import type {
  CanvasCore,
  LiveControl,
  LiveMessage,
  ScoreboardEntry,
  ScoreboardRank,
} from "@liveplace/domain/ports";
import type { CellsFrame, Event, ServerFrame } from "@liveplace/protocol";
import { describe, expect, it, vi } from "vitest";
import { type CellsListener, type ControlListener, type ControlMessage, createBroadcast } from "./broadcast";

const occurredAt = 1_700_000_000_000;

const ignoreControl: ControlListener = () => undefined;

const event = (version: number, x: number, colorIndex: number): Event => ({
  version,
  kind: "place",
  authorId: "user-1",
  occurredAt,
  cells: [{ x, y: 2, colorIndex, previousColorIndex: 0, placedAt: occurredAt }],
});

// Le noyau vu par la diffusion : un abonnement, de quoi publier à la main, et le classement que les tests règlent.
const fakeCore = () => {
  const callbacks = new Map<string, (message: LiveMessage) => void>();
  const counts = { subscribe: 0, unsubscribe: 0 };
  const scoreboard = {
    top: [] as ScoreboardEntry[],
    ranks: new Map<string, ScoreboardRank>(),
    topReads: 0,
    rankReads: [] as (readonly string[])[],
    failNext: false,
    holdNext: null as Promise<void> | null, // la prochaine lecture du top attend cette promesse
  };
  const core: Pick<CanvasCore, "subscribe" | "listScoreboard" | "listScoreboardRanks"> = {
    async subscribe(canvasId, onMessage) {
      counts.subscribe += 1;
      callbacks.set(canvasId, onMessage);
      return async () => {
        counts.unsubscribe += 1;
        callbacks.delete(canvasId);
      };
    },
    async listScoreboard() {
      scoreboard.topReads += 1;
      if (scoreboard.failNext) {
        scoreboard.failNext = false;
        throw new Error("Redis injoignable");
      }
      const held = scoreboard.holdNext;
      scoreboard.holdNext = null;
      await held;
      return scoreboard.top;
    },
    async listScoreboardRanks(_canvasId, userIds) {
      scoreboard.rankReads.push(userIds);
      return new Map([...scoreboard.ranks].filter(([userId]) => userIds.includes(userId)));
    },
  };
  const publish = (canvasId: string, published: Event) => callbacks.get(canvasId)?.({ e: published });
  const control = (canvasId: string, published: LiveControl) => callbacks.get(canvasId)?.({ ctl: published });
  return { core, counts, publish, control, scoreboard };
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

    await broadcast.join("canvas-1", first, ignoreControl);
    await broadcast.join("canvas-1", second, ignoreControl);

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
    await broadcast.join("canvas-1", (frame) => first.push(frame), ignoreControl);
    await broadcast.join("canvas-1", (frame) => second.push(frame), ignoreControl);

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
    await broadcast.join("canvas-1", (frame) => received.push(frame), ignoreControl);

    broadcast.tick();

    expect(received).toHaveLength(0);

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();
    broadcast.tick();

    expect(received).toHaveLength(1);
  });

  // Au-delà de 500 clients, ne vide le canvas qu'un tick sur deux, en conflatant les deux (écart D-13, JOURNAL 2026-09-26)
  it("flushes a canvas of more than 500 clients every second tick, conflating across both", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const received: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => received.push(frame), ignoreControl);
    for (let client = 0; client < 500; client++)
      await broadcast.join("canvas-1", () => undefined, ignoreControl);

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();

    expect(received).toHaveLength(0);

    publish("canvas-1", event(2, 3, 6));
    broadcast.tick();

    expect(received).toHaveLength(1);
    expect(received[0]?.toVersion).toBe(2);
    expect(received[0]?.cells).toHaveLength(1);
  });

  // Au-delà de 1 000 clients, un tick sur trois, et jamais moins souvent
  it("flushes a canvas of more than 1000 clients every third tick, and never less often", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const received: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => received.push(frame), ignoreControl);
    for (let client = 0; client < 2000; client++)
      await broadcast.join("canvas-1", () => undefined, ignoreControl);

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();
    broadcast.tick();

    expect(received).toHaveLength(0);

    broadcast.tick();

    expect(received).toHaveLength(1);
  });

  // Ne mélange jamais deux canvas
  it("never mixes two canvases", async () => {
    const { core, publish } = fakeCore();
    const broadcast = createBroadcast(core);
    const firstCanvas: CellsFrame[] = [];
    const secondCanvas: CellsFrame[] = [];
    await broadcast.join("canvas-1", (frame) => firstCanvas.push(frame), ignoreControl);
    await broadcast.join("canvas-2", (frame) => secondCanvas.push(frame), ignoreControl);

    publish("canvas-1", event(1, 3, 5));
    broadcast.tick();

    expect(firstCanvas).toHaveLength(1);
    expect(secondCanvas).toHaveLength(0);
  });

  // Remet un ctl tout de suite à chaque client du canvas, sans attendre le tick ni passer par la conflation
  it("hands a ctl at once to every client of the canvas, without the tick or the conflation", async () => {
    const { core, publish, control } = fakeCore();
    const broadcast = createBroadcast(core);
    const cells: CellsFrame[] = [];
    const controls: ControlMessage[] = [];
    await broadcast.join(
      "canvas-1",
      (frame) => cells.push(frame),
      (published) => controls.push(published),
    );
    await broadcast.join(
      "canvas-2",
      () => undefined,
      (published) => controls.push(published),
    );

    publish("canvas-1", event(1, 3, 5));
    control("canvas-1", { t: "banned", userId: "user-9" });

    expect(controls).toEqual([{ t: "banned", userId: "user-9" }]);
    expect(cells).toHaveLength(0);

    broadcast.tick();

    expect(cells).toHaveLength(1);
    expect(cells[0]?.toVersion).toBe(1);
  });
});

const entry = (login: string, pixels: number): ScoreboardEntry => ({ login, displayName: login, pixels });

// Une action de modération telle que moderate.lua la publie : un événement `clear`, sans case.
const moderation = (action: "ban" | "unban" | "clearUser"): Event => ({
  version: 7,
  kind: "clear",
  authorId: "owner-1",
  occurredAt,
  cells: [],
  moderation: { action, target: "user-2" },
});

// Une page du canvas : tout ce qu'elle reçoit du classement, dans l'ordre.
const joinPage = async (broadcast: ReturnType<typeof createBroadcast>, accountId?: string) => {
  const frames: ServerFrame[] = [];
  await broadcast.join(
    "canvas-1",
    () => undefined,
    (control) => {
      if (control.t === "scoreboard") frames.push(control.frame);
    },
    accountId,
  );
  return frames;
};

describe("the scoreboard window of a canvas (JOURNAL 2026-10-06)", () => {
  // Lit le top une seule fois pour tout le canvas, et envoie la même frame à chaque page
  it("reads the top once for the whole canvas, and sends the same frame to every page", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9), entry("bob", 4)];
    const first = await joinPage(broadcast);
    const second = await joinPage(broadcast);

    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    expect(scoreboard.topReads).toBe(1);
    expect(first).toEqual([{ t: "scoreboard", top: scoreboard.top }]);
    expect(second[0]).toBe(first[0]);
  });

  // Ne lit rien tant qu'une pose, un ban ou un déban n'a pas eu lieu depuis la dernière fenêtre
  it("reads nothing until a placement, a ban or an unban happened since the last window", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    await joinPage(broadcast);

    await broadcast.tickScoreboard();
    expect(scoreboard.topReads).toBe(0);

    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();
    await broadcast.tickScoreboard();
    expect(scoreboard.topReads).toBe(1);

    publish("canvas-1", moderation("ban"));
    await broadcast.tickScoreboard();
    publish("canvas-1", moderation("unban"));
    await broadcast.tickScoreboard();
    expect(scoreboard.topReads).toBe(3);
  });

  // Ne lit rien pour un retrait de pixels, qui ne change aucun score
  it("reads nothing for a removal of pixels, which changes no score", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    await joinPage(broadcast);

    publish("canvas-1", moderation("clearUser"));
    publish("canvas-1", { ...event(8, 3, 5), kind: "hide" });
    await broadcast.tickScoreboard();

    expect(scoreboard.topReads).toBe(0);
  });

  // Reste muette quand le top n'a pas changé depuis la fenêtre précédente
  it("stays silent when the top did not change since the previous window", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    const page = await joinPage(broadcast);

    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();
    publish("canvas-1", event(2, 4, 5));
    await broadcast.tickScoreboard();

    expect(scoreboard.topReads).toBe(2);
    expect(page).toHaveLength(1);
  });

  // Dit une dernière fois un top devenu vide, quand le seul joueur qui y était est banni
  it("says a top that became empty once, when the only player in it is banned", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    const page = await joinPage(broadcast);
    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    scoreboard.top = [];
    publish("canvas-1", moderation("ban"));
    await broadcast.tickScoreboard();

    expect(page.at(-1)).toEqual({ t: "scoreboard", top: [] });
  });

  // Donne à chaque compte sa place, et la frame commune à qui n'en a pas
  it("gives each account its own place, and the shared frame to whoever has none", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    scoreboard.ranks = new Map([["user-1", { rank: 7, pixels: 2 }]]);
    const placed = await joinPage(broadcast, "user-1");
    const unplaced = await joinPage(broadcast, "user-2");
    const guest = await joinPage(broadcast);

    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    expect(placed).toEqual([{ t: "scoreboard", top: scoreboard.top, you: { rank: 7, pixels: 2 } }]);
    expect(unplaced).toEqual([{ t: "scoreboard", top: scoreboard.top }]);
    expect(guest[0]).toBe(unplaced[0]);
  });

  // Lit la place de chaque compte une seule fois, même ouvert dans deux pages, et jamais celle d'un invité
  it("reads the place of each account once, even in two pages, and never that of a guest", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    await joinPage(broadcast, "user-1");
    await joinPage(broadcast, "user-1");
    await joinPage(broadcast, "user-2");
    await joinPage(broadcast);

    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    expect(scoreboard.rankReads).toEqual([["user-1", "user-2"]]);
  });

  // N'envoie sa nouvelle place qu'au compte dont elle a changé, quand le top est resté le même
  it("sends a new place only to the account whose place changed, when the top stayed the same", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    scoreboard.ranks = new Map([["user-1", { rank: 7, pixels: 2 }]]);
    const mover = await joinPage(broadcast, "user-1");
    const still = await joinPage(broadcast, "user-2");
    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    scoreboard.ranks = new Map([["user-1", { rank: 8, pixels: 2 }]]);
    publish("canvas-1", event(2, 4, 5));
    await broadcast.tickScoreboard();

    expect(mover).toHaveLength(2);
    expect(mover.at(-1)).toEqual({ t: "scoreboard", top: scoreboard.top, you: { rank: 8, pixels: 2 } });
    expect(still).toHaveLength(1);
  });

  // Dit à un compte qui perd sa place (banni) qu'il n'en a plus, sans toucher au top
  it("tells an account that loses its place (banned) that it has none, without touching the top", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    scoreboard.ranks = new Map([["user-1", { rank: 7, pixels: 2 }]]);
    const page = await joinPage(broadcast, "user-1");
    publish("canvas-1", event(1, 3, 5));
    await broadcast.tickScoreboard();

    scoreboard.ranks = new Map();
    publish("canvas-1", moderation("ban"));
    await broadcast.tickScoreboard();

    expect(page.at(-1)).toEqual({ t: "scoreboard", top: scoreboard.top });
  });

  // Garde le canvas à relire après une lecture qui échoue, et la journalise
  it("keeps the canvas to read again after a failed read, and logs it", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    scoreboard.top = [entry("ada", 9)];
    const page = await joinPage(broadcast);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    scoreboard.failNext = true;
    publish("canvas-1", event(1, 3, 5));

    await broadcast.tickScoreboard();
    expect(page).toHaveLength(0);
    expect(logged).toHaveBeenCalledWith("gateway: classement non relu", "canvas-1", expect.any(Error));

    await broadcast.tickScoreboard();
    expect(page).toHaveLength(1);
    logged.mockRestore();
  });

  // Ne lance pas une seconde lecture d'un canvas dont la lecture dure encore
  it("does not start a second read of a canvas whose read is still running", async () => {
    const { core, publish, scoreboard } = fakeCore();
    const broadcast = createBroadcast(core);
    await joinPage(broadcast);
    let release: () => void = () => undefined;
    scoreboard.holdNext = new Promise((resolve) => {
      release = resolve;
    });
    publish("canvas-1", event(1, 3, 5));

    const running = broadcast.tickScoreboard();
    publish("canvas-1", event(2, 4, 5));
    await broadcast.tickScoreboard();
    expect(scoreboard.topReads).toBe(1);

    release();
    await running;
    await broadcast.tickScoreboard();
    expect(scoreboard.topReads).toBe(2);
  });
});

// Écart §5.1 (JOURNAL 2026-10-07) : la capacité lit le délai de diffusion et les connexions, sans rien coûter par pose.
describe("what the broadcast tells the capacity (JOURNAL 2026-10-07)", () => {
  // Compte, à l'envoi de la frame, le délai de chaque pose : de son `occurredAt` à l'instant du tick
  it("counts, when the frame is sent, the delay of each pose: from its `occurredAt` to the instant of the tick", async () => {
    const { core, publish } = fakeCore();
    const delays: number[] = [];
    const broadcast = createBroadcast(core, {
      now: () => occurredAt + 180,
      record: (delay) => delays.push(delay),
    });
    await broadcast.join("canvas-1", () => undefined, ignoreControl);

    publish("canvas-1", event(1, 3, 5));
    publish("canvas-1", { ...event(2, 4, 5), occurredAt: occurredAt + 100 });
    broadcast.tick();

    expect(delays).toEqual([180, 80]); // les deux poses, même conflatées dans une seule frame
  });

  // Ne compte que les poses : un retrait ou une modération n'est pas une pose reçue
  it("counts only poses: a clear or a hide is not a pose received", async () => {
    const { core, publish } = fakeCore();
    const delays: number[] = [];
    const broadcast = createBroadcast(core, {
      now: () => occurredAt + 50,
      record: (delay) => delays.push(delay),
    });
    await broadcast.join("canvas-1", () => undefined, ignoreControl);

    publish("canvas-1", { ...event(1, 3, 5), kind: "clear" });
    publish("canvas-1", { ...event(2, 4, 5), kind: "hide" });
    broadcast.tick();

    expect(delays).toEqual([]);
  });

  // Ne compte rien tant que la frame n'est pas partie : le canvas attend son tour (plus de 500 clients)
  it("counts nothing until the frame has gone: the canvas waits for its turn", async () => {
    const { core, publish } = fakeCore();
    const delays: number[] = [];
    const broadcast = createBroadcast(core, {
      now: () => occurredAt + 200,
      record: (delay) => delays.push(delay),
    });
    for (let index = 0; index < 501; index++)
      await broadcast.join("canvas-1", () => undefined, ignoreControl);
    publish("canvas-1", event(1, 3, 5));

    broadcast.tick();
    expect(delays).toEqual([]);

    broadcast.tick();
    expect(delays).toEqual([200]);
  });

  // Dit les connexions en tout et celles du plus gros canvas
  it("tells the connections in all and those of the largest canvas", async () => {
    const { core } = fakeCore();
    const broadcast = createBroadcast(core);
    expect(broadcast.countConnections()).toEqual({ total: 0, largestCanvas: 0 });

    await broadcast.join("canvas-1", () => undefined, ignoreControl);
    await broadcast.join("canvas-2", () => undefined, ignoreControl);
    const third: CellsListener = () => undefined;
    await broadcast.join("canvas-2", third, ignoreControl);
    await broadcast.join("canvas-2", () => undefined, ignoreControl);

    expect(broadcast.countConnections()).toEqual({ total: 4, largestCanvas: 3 });

    await broadcast.leave("canvas-2", third);

    expect(broadcast.countConnections()).toEqual({ total: 3, largestCanvas: 2 });
  });
});
