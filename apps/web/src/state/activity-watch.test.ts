import type { ActivityPeriod } from "@liveplace/domain";
import type { ActivityFrame, ActivityPoint } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import { type ActivityClock, type ActivityWatchCanvas, createActivityWatch } from "./activity-watch";
import type { RequestResult } from "./canvas-store";

const point = (at: number): ActivityPoint => ({
  at,
  people: 1,
  streamed: 0,
  pixels: 2,
  signups: 0,
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
});

const noAudience = {
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  activeAccounts: 0,
  activePlayers: 0,
  activeStreamers: 0,
};

const frame: ActivityFrame = {
  t: "activity",
  now: { people: 2, guests: 1, streamed: 0, pixels: 5, signups: 0 },
  audience: { today: noAudience, month: noAudience },
  canvases: [],
};

type Asked = { period: ActivityPeriod; answer: (result: RequestResult<ActivityPoint[]>) => void };

const setup = () => {
  const isWatchingSent: boolean[] = [];
  const asked: Asked[] = [];
  const listening: { listener: ((heard: ActivityFrame) => void) | null } = { listener: null };
  const canvas: ActivityWatchCanvas = {
    watchActivity: (isWatching) => {
      isWatchingSent.push(isWatching);
    },
    listActivityHistory: (period) => new Promise((answer) => asked.push({ period, answer })),
    listenActivity: (listener) => {
      listening.listener = listener;
      return () => {
        listening.listener = null;
      };
    },
  };
  const timers: { ms: number; run: () => void; isStopped: boolean }[] = [];
  const clock: ActivityClock = {
    repeat: (ms, run) => {
      const timer = { ms, run, isStopped: false };
      timers.push(timer);
      return () => {
        timer.isStopped = true;
      };
    },
  };
  const watch = createActivityWatch(canvas, clock);
  // Laisse la réponse d'une requête arriver jusqu'au store.
  const answered = async (index: number, result: RequestResult<ActivityPoint[]>) => {
    asked[index]?.answer(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { watch, isWatchingSent, asked, timers, listening, answered };
};

describe("the developer's activity section (écart §4.2, JOURNAL 2026-10-06)", () => {
  // À l'ouverture, regarde l'activité et demande l'historique de 24 h, puis chaque minute jusqu'à la fermeture
  it("at opening, watches the activity and asks the 24 h history, then every minute until closing", () => {
    const { watch, isWatchingSent, asked, timers } = setup();

    watch.open();
    watch.open();
    timers[0]?.run();
    watch.close();
    watch.close();

    expect(isWatchingSent).toEqual([true, false]);
    expect(asked.map(({ period }) => period)).toEqual(["day", "day"]);
    expect(timers).toEqual([{ ms: 60_000, run: expect.any(Function), isStopped: true }]);
  });

  // Montre l'historique demandé, recharge à une autre période, et ignore une réponse dépassée
  it("shows the asked history, loads again at another period, and ignores an outdated answer", async () => {
    const { watch, asked, answered } = setup();
    watch.open();
    await answered(0, { ok: true, value: [point(1)] });
    expect(watch.getView()).toMatchObject({
      period: "day",
      history: { status: "ready", points: [point(1)] },
    });

    watch.selectPeriod("month");
    expect(watch.getView()).toMatchObject({ period: "month", history: { status: "loading" } });
    watch.selectPeriod("all");
    await answered(1, { ok: true, value: [point(2)] });
    expect(watch.getView().history).toEqual({ status: "loading" });
    await answered(2, { ok: true, value: [point(3)] });

    expect(asked.map(({ period }) => period)).toEqual(["day", "month", "all"]);
    expect(watch.getView()).toMatchObject({
      period: "all",
      history: { status: "ready", points: [point(3)] },
    });
  });

  // Garde les courbes montrées quand une relecture échoue, et dit l'échec quand rien n'est montré
  it("keeps the shown curves when a refresh fails, and tells the failure when nothing is shown", async () => {
    const { watch, timers, answered } = setup();
    watch.open();
    await answered(0, { ok: false, error: "closed" });
    expect(watch.getView().history).toEqual({ status: "failed" });

    timers[0]?.run();
    await answered(1, { ok: true, value: [point(1)] });
    timers[0]?.run();
    await answered(2, { ok: false, error: "closed" });

    expect(watch.getView().history).toEqual({ status: "ready", points: [point(1)] });
  });

  // Montre chaque frame activity tant que la section est ouverte, et repart à vide à chaque ouverture
  it("shows each activity frame while the section is open, and starts empty at each opening", () => {
    const { watch, listening } = setup();
    const seen: number[] = [];
    watch.subscribe(() => seen.push(watch.getView().activity?.now.people ?? 0));

    listening.listener?.(frame);
    watch.open();
    listening.listener?.(frame);
    expect(watch.getView().activity).toBe(frame);
    expect(watch.getView().activity?.audience).toEqual({ today: noAudience, month: noAudience });
    watch.close();
    watch.open();

    expect(watch.getView().activity).toBeNull();
    expect(seen).toContain(2);
  });

  // Arrête tout en partant : ne regarde plus, ne relit plus, n'écoute plus
  it("stops everything when leaving: no more watching, refreshing or listening", () => {
    const { watch, isWatchingSent, timers, listening } = setup();
    watch.open();

    watch.dispose();

    expect(isWatchingSent).toEqual([true, false]);
    expect(timers[0]?.isStopped).toBe(true);
    expect(listening.listener).toBeNull();
  });
});
