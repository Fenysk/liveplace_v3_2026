import type { ActivityPeriod } from "@liveplace/domain";
import type {
  ActivityDay,
  ActivityFrame,
  ActivityHistory,
  ActivityPoint,
  CanvasActivityPoint,
} from "@liveplace/domain/ports";
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

const canvasPoint = (at: number): CanvasActivityPoint => ({
  at,
  people: 1,
  streamedMinutes: 0,
  pixels: 2,
  visits: 0,
  visitMinutes: 0,
  signups: 0,
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

type Asked = { period: ActivityPeriod; answer: (result: RequestResult<ActivityHistory>) => void };
type AskedDay = { dayAt: number; answer: (result: RequestResult<ActivityDay>) => void };

// Un jour passé (JOURNAL 2026-10-14), tel que le gateway le rend.
const dayAnswer = (dayAt: number): ActivityDay => ({
  dayAt,
  grain: "minute",
  points: [],
  canvases: [],
  here: { canvasId: "c1", grain: "minute", points: [] },
});

const setup = () => {
  const isWatchingSent: boolean[] = [];
  const asked: Asked[] = [];
  const askedDays: AskedDay[] = [];
  const listening: { listener: ((heard: ActivityFrame) => void) | null } = { listener: null };
  const canvas: ActivityWatchCanvas = {
    watchActivity: (isWatching) => {
      isWatchingSent.push(isWatching);
    },
    listActivityHistory: (period) => new Promise((answer) => asked.push({ period, answer })),
    listActivityDay: (dayAt) => new Promise((answer) => askedDays.push({ dayAt, answer })),
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
  const answered = async (index: number, result: RequestResult<ActivityHistory>) => {
    asked[index]?.answer(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const answeredDay = async (index: number, result: RequestResult<ActivityDay>) => {
    askedDays[index]?.answer(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { watch, isWatchingSent, asked, askedDays, timers, listening, answered, answeredDay };
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

  // Garde avec l'historique les points du canvas de la socket, et aucun quand le gateway est d'avant (JOURNAL 2026-10-07)
  it("keeps with the history the points of the socket's canvas, and none when the gateway is from before", async () => {
    const { watch, answered } = setup();
    watch.open();

    await answered(0, { ok: true, value: { points: [point(1)], canvasPoints: [canvasPoint(1)] } });
    expect(watch.getView().history).toEqual({
      status: "ready",
      points: [point(1)],
      canvasPoints: [canvasPoint(1)],
    });

    watch.selectPeriod("month");
    await answered(1, { ok: true, value: { points: [point(2)] } });
    expect(watch.getView().history).toEqual({ status: "ready", points: [point(2)] });
    expect(watch.getView().history).not.toHaveProperty("canvasPoints");
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

  // Connaît le plus ancien jour gardé avec le premier historique, et le garde, hors des courbes montrées
  it("knows the oldest kept day with the first history, keeps it, and leaves it out of the shown curves (JOURNAL 2026-10-14)", async () => {
    const { watch, timers, answered } = setup();
    watch.open();
    expect(watch.getView().firstDayAt).toBeUndefined();

    await answered(0, { ok: true, value: { points: [point(1)], firstDayAt: 5 } });
    timers[0]?.run();
    await answered(1, { ok: true, value: { points: [point(2)] } });

    expect(watch.getView().firstDayAt).toBe(5);
    expect(watch.getView().history).toEqual({ status: "ready", points: [point(2)] });
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

// JOURNAL 2026-10-14 : un jour passé se lit une fois à son choix, partagé par les deux sections.
describe("the past day of the developer's window (JOURNAL 2026-10-14)", () => {
  const DAY_A = 1_000_000;
  const DAY_B = 2_000_000;

  // Lit un jour passé une fois à son choix, le montre, et ne le relit pas à la minute comme l'historique
  it("reads a past day once at its choice and shows it, without reading it every minute like the history", async () => {
    const { watch, asked, askedDays, timers, answeredDay } = setup();
    watch.open();
    expect(watch.getView().past).toBeUndefined();

    watch.selectDay(DAY_A);
    expect(watch.getView().past).toEqual({ dayAt: DAY_A, day: { status: "loading" } });
    await answeredDay(0, { ok: true, value: dayAnswer(DAY_A) });
    timers[0]?.run();

    expect(watch.getView().past).toEqual({ dayAt: DAY_A, day: { status: "ready", ...dayAnswer(DAY_A) } });
    expect(askedDays.map(({ dayAt }) => dayAt)).toEqual([DAY_A]);
    expect(asked).toHaveLength(2);
  });

  // Ignore la réponse d'un jour dépassé quand un autre est choisi entre-temps
  it("ignores the answer for a day that was left behind when another is chosen meanwhile", async () => {
    const { watch, askedDays, answeredDay } = setup();
    watch.open();

    watch.selectDay(DAY_A);
    watch.selectDay(DAY_B);
    await answeredDay(0, { ok: true, value: dayAnswer(DAY_A) });
    expect(watch.getView().past).toEqual({ dayAt: DAY_B, day: { status: "loading" } });
    await answeredDay(1, { ok: true, value: dayAnswer(DAY_B) });

    expect(askedDays.map(({ dayAt }) => dayAt)).toEqual([DAY_A, DAY_B]);
    expect(watch.getView().past).toMatchObject({ dayAt: DAY_B, day: { status: "ready", dayAt: DAY_B } });
  });

  // Relit un jour où l'on revient, et dit l'échec d'une lecture
  it("reads again a day we come back to, and tells the failure of a read", async () => {
    const { watch, askedDays, answeredDay } = setup();
    watch.open();

    watch.selectDay(DAY_A);
    await answeredDay(0, { ok: true, value: dayAnswer(DAY_A) });
    watch.selectDay(DAY_B);
    await answeredDay(1, { ok: false, error: "closed" });
    expect(watch.getView().past).toEqual({ dayAt: DAY_B, day: { status: "failed" } });
    watch.selectDay(DAY_A);
    await answeredDay(2, { ok: true, value: dayAnswer(DAY_A) });

    expect(askedDays.map(({ dayAt }) => dayAt)).toEqual([DAY_A, DAY_B, DAY_A]);
    expect(watch.getView().past?.day.status).toBe("ready");
  });

  // Revient à aujourd'hui sans rien lire, et la réponse d'un jour qu'on quitte ne revient pas le montrer
  it("goes back to today without reading anything, and the answer of a day we leave does not show it again", async () => {
    const { watch, askedDays, answeredDay } = setup();
    watch.open();
    watch.selectDay(DAY_A);

    watch.selectDay(undefined);
    await answeredDay(0, { ok: true, value: dayAnswer(DAY_A) });

    expect(watch.getView().past).toBeUndefined();
    expect(askedDays).toHaveLength(1);
  });

  // Revient à aujourd'hui à la fermeture de la fenêtre, et la rouvre sur aujourd'hui sans relire le jour quitté
  it("goes back to today when the window closes, and reopens on today without reading the day left", async () => {
    const { watch, askedDays, answeredDay } = setup();
    watch.open();
    watch.selectDay(DAY_A);
    await answeredDay(0, { ok: true, value: dayAnswer(DAY_A) });

    watch.close();
    expect(watch.getView().past).toBeUndefined();
    watch.open();

    expect(watch.getView().past).toBeUndefined();
    expect(askedDays).toHaveLength(1);
  });

  // Ne lit un jour choisi avant l'ouverture qu'à l'ouverture
  it("reads a day chosen before the opening only at the opening", () => {
    const { watch, askedDays } = setup();

    watch.selectDay(DAY_A);
    expect(askedDays).toHaveLength(0);
    watch.open();

    expect(askedDays.map(({ dayAt }) => dayAt)).toEqual([DAY_A]);
    expect(watch.getView().past).toEqual({ dayAt: DAY_A, day: { status: "loading" } });
  });
});
