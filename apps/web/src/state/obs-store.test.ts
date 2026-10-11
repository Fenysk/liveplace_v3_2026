import { type ObsBackground, PALETTE } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import type { Arrival, CanvasView } from "./canvas-store";
import { createObsStore, type ObsCanvas, type ObsClock } from "./obs-store";

const t0 = 1_700_000_000_000;
const OFFSET = 9; // la case (1, 2) sur un canvas de 4 de large

const viewWithDelay = (obsDelayMs: number): CanvasView => ({
  status: "live",
  width: 4,
  height: 4,
  palette: PALETTE,
  version: 1,
  role: "guest",
  params: {
    gaugeMaxStart: 10,
    gaugeMaxCeiling: 150,
    refillMs: 10_000,
    refillCharges: 1,
    obsDelayMs,
    obsBackground: "transparent",
  },
  gauge: null,
  reportCount: 0,
  lastError: null,
  inspection: null,
  isBanned: false,
  isArchived: false,
  isDiscarded: false,
  pixels: new Uint8Array(16),
});

// Le store du canvas vu de la vue OBS : sa vue, ses arrivées, et rien d'autre.
const setup = () => {
  let view = viewWithDelay(10_000);
  const listeners = new Set<() => void>();
  const arrivalListeners = new Set<(arrival: Arrival) => void>();
  const canvas: ObsCanvas = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    listenArrivals: (listener) => {
      arrivalListeners.add(listener);
      return () => arrivalListeners.delete(listener);
    },
  };
  // Une horloge qu'on avance à la main : les minuteurs partent quand on y arrive.
  const clock = { nowMs: t0, timers: [] as { at: number; run: () => void }[] };
  const obsClock: ObsClock = {
    now: () => clock.nowMs,
    wait: (ms, run) => {
      const timer = { at: clock.nowMs + ms, run };
      clock.timers.push(timer);
      return () => {
        clock.timers = clock.timers.filter((other) => other !== timer);
      };
    },
  };
  const advanceTo = (nowMs: number) => {
    clock.nowMs = nowMs;
    const due = clock.timers.filter((timer) => timer.at <= nowMs);
    clock.timers = clock.timers.filter((timer) => timer.at > nowMs);
    for (const timer of due) timer.run();
  };
  const arrive = (arrival: Arrival) => {
    for (const listener of arrivalListeners) listener(arrival);
  };
  const setDelay = (obsDelayMs: number) => {
    view = viewWithDelay(obsDelayMs);
    for (const listener of listeners) listener();
  };
  const setBackground = (obsBackground: ObsBackground) => {
    if (view.params) view = { ...view, params: { ...view.params, obsBackground } };
    for (const listener of listeners) listener();
  };
  // L'image et son opacité se disent seules : le reste de `params` est celui du moment, sans l'ancienne image ni l'ancienne opacité.
  const setBackgroundImage = (image: { at?: number; opacity?: number }) => {
    if (view.params) {
      const { backgroundImageAt: previousAt, backgroundImageOpacity: previousOpacity, ...rest } = view.params;
      view = {
        ...view,
        params: {
          ...rest,
          ...(image.at ? { backgroundImageAt: image.at } : {}),
          ...(image.opacity === undefined ? {} : { backgroundImageOpacity: image.opacity }),
        },
      };
    }
    for (const listener of listeners) listener();
  };
  const store = createObsStore(canvas, obsClock);
  return { store, advanceTo, arrive, setDelay, setBackground, setBackgroundImage };
};

const pose = (placedAt: number) => ({
  kind: "cells" as const,
  frame: {
    toVersion: 2,
    cells: [
      { x: 1, y: 2, colorIndex: 5, previousColorIndex: 0, placedAt, version: 2, kind: "place" as const },
    ],
  },
});

describe("createObsStore (§9.5, JOURNAL 2026-09-25)", () => {
  // Montre le snapshot, puis une pose seulement quand son délai est écoulé, par son seul minuteur
  it("shows the snapshot, then a placement only once its delay has elapsed, on its own timer", () => {
    const { store, advanceTo, arrive } = setup();

    arrive({ kind: "snapshot", pixels: new Uint8Array(16).fill(3), recent: null });
    arrive(pose(t0));
    expect(store.getView().pixels[OFFSET]).toBe(3);

    advanceTo(t0 + 9999);
    expect(store.getView().pixels[OFFSET]).toBe(3);
    advanceTo(t0 + 10_000);
    expect(store.getView().pixels[OFFSET]).toBe(5);
  });

  // Prend un délai changé à chaud : ce qui attend suit le nouveau délai, sans rechargement
  it("takes a delay changed live: what is waiting follows the new delay, without a reload", () => {
    const { store, advanceTo, arrive, setDelay } = setup();
    arrive({ kind: "snapshot", pixels: new Uint8Array(16).fill(3), recent: null });
    arrive(pose(t0));

    setDelay(60_000);
    advanceTo(t0 + 10_000);
    expect(store.getView().pixels[OFFSET]).toBe(3);

    setDelay(5000);
    expect(store.getView().pixels[OFFSET]).toBe(5);
  });

  // Prend un fond changé à chaud, sans rechargement (JOURNAL 2026-09-29)
  it("takes a background changed live, without a reload", () => {
    const { store, arrive, setBackground } = setup();
    arrive({ kind: "snapshot", pixels: new Uint8Array(16), recent: null });
    expect(store.getView().background).toBe("transparent");

    setBackground("white");
    expect(store.getView().background).toBe("white");

    setBackground("black");
    expect(store.getView().background).toBe("black");
  });

  // Prend l'image du fond posée, changée ou retirée à chaud, sans toucher au fond, sans rechargement (Écart §9.1, JOURNAL 2026-10-10)
  it("takes a background image set, changed or cleared live, leaving the background alone, without a reload", () => {
    const { store, arrive, setBackground, setBackgroundImage } = setup();
    arrive({ kind: "snapshot", pixels: new Uint8Array(16), recent: null });
    expect(store.getView().backgroundImageAt).toBeUndefined();

    setBackground("black");
    setBackgroundImage({ at: 1_760_000_000_000 });
    expect(store.getView()).toMatchObject({ background: "black", backgroundImageAt: 1_760_000_000_000 });

    setBackgroundImage({ at: 1_770_000_000_000 });
    expect(store.getView().backgroundImageAt).toBe(1_770_000_000_000);

    setBackgroundImage({});
    expect(store.getView().backgroundImageAt).toBeUndefined();
  });

  // L'opacité de l'image : 40 % tant que le canvas n'en dit pas une, puis celle qu'il dit, à chaud
  it("shows 40 % for the image opacity until the canvas says another, then takes it live", () => {
    const { store, arrive, setBackgroundImage } = setup();
    arrive({ kind: "snapshot", pixels: new Uint8Array(16), recent: null });
    expect(store.getView().backgroundImageOpacity).toBe(40);

    setBackgroundImage({ opacity: 80 });
    expect(store.getView().backgroundImageOpacity).toBe(80);

    setBackgroundImage({ opacity: 0 });
    expect(store.getView().backgroundImageOpacity).toBe(0);
  });

  // N'est prête qu'après son premier snapshot
  it("is ready only after its first snapshot", () => {
    const { store, arrive } = setup();

    expect(store.getView().isReady).toBe(false);
    arrive({ kind: "snapshot", pixels: new Uint8Array(16), recent: null });
    expect(store.getView()).toMatchObject({ isReady: true, width: 4, height: 4 });
  });
});
