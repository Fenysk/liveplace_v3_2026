import type { ActivityPeriod } from "@liveplace/domain";
import type { CapacityFrame, CapacityHistory, CapacityPoint } from "@liveplace/domain/ports";
import { describe, expect, it } from "vitest";
import type { ActivityClock } from "./activity-watch";
import type { RequestResult } from "./canvas-store";
import { type CapacityWatchCanvas, createCapacityWatch } from "./capacity-watch";

const point = (at: number): CapacityPoint => ({ at, saturation: 62.1, resource: "redisMemory", redis: 62.1 });

const frame: CapacityFrame = {
  t: "capacity",
  saturation: { percent: 62.1, resource: "redisMemory", isIncomplete: false },
  resources: [],
};

type Asked = { period: ActivityPeriod; answer: (result: RequestResult<CapacityHistory>) => void };

const setup = () => {
  const isWatchingSent: boolean[] = [];
  const asked: Asked[] = [];
  const listening: { listener: ((heard: CapacityFrame) => void) | null } = { listener: null };
  const canvas: CapacityWatchCanvas = {
    watchCapacity: (isWatching) => {
      isWatchingSent.push(isWatching);
    },
    listCapacityHistory: (period) => new Promise((answer) => asked.push({ period, answer })),
    listenCapacity: (listener) => {
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
  const watch = createCapacityWatch(canvas, clock);
  // Laisse la réponse d'une requête arriver jusqu'au store.
  const answered = async (index: number, result: RequestResult<CapacityHistory>) => {
    asked[index]?.answer(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { watch, isWatchingSent, asked, timers, listening, answered };
};

describe("the developer's capacity section (écart §4.2, JOURNAL 2026-10-07)", () => {
  // À l'ouverture, regarde la capacité et demande l'historique de 24 h, puis chaque minute jusqu'à la fermeture
  it("at opening, watches the capacity and asks the 24 h history, then every minute until closing", () => {
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
    await answered(0, { ok: true, value: { points: [point(1)] } });
    expect(watch.getView()).toMatchObject({
      period: "day",
      history: { status: "ready", points: [point(1)] },
    });

    watch.selectPeriod("month");
    expect(watch.getView()).toMatchObject({ period: "month", history: { status: "loading" } });
    watch.selectPeriod("all");
    await answered(1, { ok: true, value: { points: [point(2)] } });
    expect(watch.getView().history).toEqual({ status: "loading" });
    await answered(2, { ok: true, value: { points: [point(3)] } });

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
    await answered(1, { ok: true, value: { points: [point(1)] } });
    timers[0]?.run();
    await answered(2, { ok: false, error: "closed" });

    expect(watch.getView().history).toEqual({ status: "ready", points: [point(1)] });
  });

  // Montre chaque frame capacity tant que la section est ouverte, et repart à vide à chaque ouverture
  it("shows each capacity frame while the section is open, and starts empty at each opening", () => {
    const { watch, listening } = setup();
    const seen: number[] = [];
    watch.subscribe(() => seen.push(watch.getView().capacity?.saturation.percent ?? 0));

    listening.listener?.(frame);
    watch.open();
    listening.listener?.(frame);
    expect(watch.getView().capacity).toBe(frame);
    watch.close();
    watch.open();

    expect(watch.getView().capacity).toBeNull();
    expect(seen).toContain(62.1);
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
