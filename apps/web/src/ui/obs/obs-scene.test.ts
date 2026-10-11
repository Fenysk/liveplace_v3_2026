import { PALETTE, toStateOffset } from "@liveplace/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArrivedPixel } from "../../state/canvas-store";
import type { ObsStore, ObsView } from "../../state/obs-store";
import { createHandoff, type Handoff } from "../canvas/handoff";
import { createObsScene, type ObsScene } from "./obs-scene";
import type { ObsFrame } from "./render-obs";

// La scène tourne ici sans navigateur : seules l'image peinte (on y lit le cadre, les effets) et les images hors écran sont remplacées.
const probe = vi.hoisted(() => ({ frames: [] as unknown[], levelBuilds: 0 }));
vi.mock("./render-obs", () => ({
  renderObs: (_context: unknown, frame: unknown) => {
    probe.frames.push(frame);
  },
}));
vi.mock("../canvas/canvas-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../canvas/canvas-image")>()),
  createCanvasImage: () => ({ source: {}, repaint: () => undefined }),
  toLevelCanvases: (levels: readonly object[]) => {
    probe.levelBuilds += 1;
    return levels.map(() => ({}));
  },
}));
vi.mock("../canvas/canvas-background", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../canvas/canvas-background")>()),
  createBackdropImage: () => ({ set: () => undefined, get: () => null, dispose: () => undefined }),
  createPropertyReader: () => () => "",
}));

const FRAME_MS = 16;
const SETTLE_MS = 600;
const NO_OP = (): void => undefined;
const SIZE = 50;

// Le navigateur que la scène lit, joué à la main : le temps des images, l'observateur de taille, les jetons de mouvement.
const browser = {
  now: 0,
  lastFrameId: 0,
  frames: new Map<number, (time: number) => void>(),
  resizes: [] as (() => void)[],
  isReducedMotion: false,
};

class FakeResizeObserver {
  constructor(callback: () => void) {
    browser.resizes.push(callback);
  }
  observe = NO_OP;
  disconnect = NO_OP;
}

const cssValue = (name: string): string => {
  if (browser.isReducedMotion) return name === "--lp-ease" ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : "0s";
  const values: Record<string, string> = {
    "--lp-dur-reveal": "0.5s",
    "--lp-dur-arrival": "0.3s",
    "--lp-ease": "cubic-bezier(0.2, 0.8, 0.2, 1)",
  };
  return values[name] ?? "";
};

type FakeCanvas = Pick<HTMLCanvasElement, "width" | "height" | "clientWidth" | "clientHeight"> & {
  getContext: (...args: never[]) => object | null;
};
const fakeCanvas = (clientWidth = 400, clientHeight = 300): FakeCanvas => ({
  width: 0,
  height: 0,
  clientWidth,
  clientHeight,
  getContext: () => ({ drawImage: NO_OP }),
});

const startBrowser = () => {
  browser.now = 0;
  browser.frames.clear();
  browser.resizes.length = 0;
  probe.frames.length = 0;
  probe.levelBuilds = 0;
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", { documentElement: {}, createElement: () => fakeCanvas() });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: cssValue }));
  vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
    browser.lastFrameId += 1;
    browser.frames.set(browser.lastFrameId, callback);
    return browser.lastFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    browser.frames.delete(id);
  });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
};

// Fait avancer les images de `ms` millisecondes : une image annulée par une autre de la même passe ne court pas.
const flush = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    browser.now += FRAME_MS;
    for (const [id, callback] of [...browser.frames]) {
      if (browser.frames.delete(id)) callback(browser.now);
    }
  }
};

const lastFrame = (): ObsFrame => {
  const frame = probe.frames.at(-1);
  if (!frame) throw new Error("aucune image n'a été peinte");
  return frame as ObsFrame;
};
const framesOf = () => probe.frames as ObsFrame[];

// Le store de la vue OBS, que le test pousse à la main : sa vue, et les cases qu'il montre.
const openStore = ({ isReady = false }: { isReady?: boolean } = {}) => {
  let view: ObsView = {
    isReady,
    width: SIZE,
    height: SIZE,
    palette: [...PALETTE],
    pixels: new Uint8Array(SIZE * SIZE),
    background: "transparent",
    backgroundImageOpacity: 40,
  };
  const listeners = new Set<() => void>();
  const arrivedListeners = new Set<(lot: readonly ArrivedPixel[]) => void>();
  const store: ObsStore = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    listenArrived: (listener) => {
      arrivedListeners.add(listener);
      return () => arrivedListeners.delete(listener);
    },
    dispose: NO_OP,
  };
  const publish = (next: Partial<ObsView> = {}) => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };
  return {
    store,
    publish,
    // Le stream montre ces cases : l'image les porte, puis la file le dit, comme le store.
    show: (lot: readonly ArrivedPixel[]) => {
      for (const { x, y, colorIndex } of lot) view.pixels[toStateOffset(x, y, SIZE)] = colorIndex;
      publish();
      for (const listener of arrivedListeners) listener(lot);
    },
    // Une modération : la case change d'un coup, sans passer par le fondu.
    setPixel: (x: number, y: number, colorIndex: number) => {
      view.pixels[toStateOffset(x, y, SIZE)] = colorIndex;
      publish();
    },
  };
};

type Options = { isReady?: boolean; isReducedMotion?: boolean; handoff?: Handoff; element?: FakeCanvas };

const openScene = ({
  isReady = true,
  isReducedMotion = false,
  handoff,
  element = fakeCanvas(),
}: Options = {}) => {
  browser.isReducedMotion = isReducedMotion;
  const world = openStore({ isReady });
  const scene: ObsScene = createObsScene(element as HTMLCanvasElement, world.store, {
    login: "kalyss",
    handoff,
  });
  flush(FRAME_MS);
  return { ...world, scene, element, pendingFrames: () => browser.frames.size };
};

// Une rangée de cases, du bord gauche, toutes de la même couleur, qui remplacent la couleur 0.
const rowOf = (size: number, row: number, colorIndex: number): ArrivedPixel[] =>
  Array.from({ length: size }, (_, x) => ({ x, y: row, colorIndex, previousColorIndex: 0 }));

describe("la scène de la vue OBS", () => {
  beforeEach(startBrowser);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Avant la première image du stream, rien n'est dessiné et rien n'est attendu : la surface garde ce qu'elle montrait
  it("paints nothing before the stream has an image, and schedules nothing", () => {
    const world = openScene({ isReady: false });
    flush(SETTLE_MS);

    expect(framesOf()).toEqual([]);
    expect(world.pendingFrames()).toBe(0);
  });

  // L'image arrive : la mosaïque, quatre étapes dans l'ordre sur `--lp-dur-reveal`, puis plus rien n'est attendu
  it("reveals the fresque as a mosaic over --lp-dur-reveal when the first image comes, then schedules nothing", () => {
    const world = openScene({ isReady: false });

    world.publish({ isReady: true });
    flush(SETTLE_MS);

    const steps = framesOf().flatMap(({ reveal }) => (reveal ? [reveal] : []));
    expect(new Set(steps.map(({ step }) => step))).toEqual(new Set([0, 1, 2, 3]));
    expect(steps[0]).toMatchObject({ step: 0, progress: 0 });
    expect(steps.length).toBeGreaterThanOrEqual(28);
    expect(steps.length).toBeLessThanOrEqual(34);
    expect(probe.levelBuilds).toBe(1);
    expect(lastFrame().reveal).toBeNull();
    expect(world.pendingFrames()).toBe(0);
  });

  // Le cadre est celui de la vue OBS : rempli sans déformation, centré
  it("keeps its framing: the fresque fills the source without distortion, centered", () => {
    openScene();

    expect(lastFrame().surface).toEqual({ width: 400, height: 300 });
    expect(lastFrame().frame).toEqual({ left: 50, top: 0, width: 300, height: 300 });
  });

  // Mouvement réduit : la durée vaut 0, la fresque paraît d'un coup, sans mosaïque ni image attendue
  it("shows the fresque at once when motion is reduced", () => {
    const world = openScene({ isReducedMotion: true });
    flush(SETTLE_MS);

    expect(framesOf().every(({ reveal }) => reveal === null)).toBe(true);
    expect(probe.levelBuilds).toBe(0);
    expect(world.pendingFrames()).toBe(0);
  });

  // Une case que le stream montre : en fondu sur `--lp-dur-arrival`, dès l'instant où il la montre, puis plus rien n'est attendu
  it("fades a cell in over --lp-dur-arrival from the moment the stream shows it, then schedules nothing", () => {
    const world = openScene();
    flush(SETTLE_MS);

    world.show([{ x: 5, y: 5, colorIndex: 9, previousColorIndex: 0 }]);
    flush(FRAME_MS);

    expect(lastFrame().arriving).toEqual([
      { x: 5, y: 5, base: [{ colorIndex: 0, alpha: 1 }], colorIndex: 9, progress: 0 },
    ]);
    flush(SETTLE_MS);
    expect(lastFrame().arriving).toEqual([]);
    expect(world.pendingFrames()).toBe(0);
  });

  // Les cases d'un lot paraissent l'une après l'autre, dans l'ordre du lot
  it("shows the cells of a lot one after the other, in the order of the lot", () => {
    const world = openScene();
    flush(SETTLE_MS);

    world.show(rowOf(10, 5, 9));
    flush(FRAME_MS * 25);

    const progresses = lastFrame().arriving.map(({ progress }) => progress);
    expect(progresses.length).toBeGreaterThanOrEqual(5);
    expect(progresses).toEqual([...progresses].sort((a, b) => b - a));
    expect(progresses.at(-1)).toBe(0);
    flush(SETTLE_MS * 2);
    expect(lastFrame().arriving).toEqual([]);
    expect(world.pendingFrames()).toBe(0);
  });

  // Au plus 200 cases en fondu : un lot qui ne tient pas dans la place restante paraît en entier d'un coup
  it("shows a lot that does not fit in the 200 places at once, never half animated", () => {
    const world = openScene();
    flush(SETTLE_MS);

    for (const row of [1, 2, 3, 4]) world.show(rowOf(48, row, 9));
    flush(FRAME_MS);
    expect(lastFrame().arriving).toHaveLength(192);

    world.show(rowOf(48, 5, 9));
    flush(FRAME_MS);

    expect(lastFrame().arriving).toHaveLength(192);
    expect(lastFrame().arriving.some(({ y }) => y === 5)).toBe(false);
    flush(SETTLE_MS * 4);
    expect(lastFrame().arriving).toEqual([]);
    expect(world.pendingFrames()).toBe(0);
  });

  // Une case réécrite pendant son fondu repart de ses couleurs du moment
  it("starts a rewritten cell again from the colors it was showing", () => {
    const world = openScene();
    flush(SETTLE_MS);
    world.show([{ x: 5, y: 5, colorIndex: 9, previousColorIndex: 0 }]);
    flush(FRAME_MS * 4);

    world.show([{ x: 5, y: 5, colorIndex: 14, previousColorIndex: 9 }]);
    flush(FRAME_MS);

    const [rewritten] = lastFrame().arriving;
    expect(rewritten?.colorIndex).toBe(14);
    expect(rewritten?.base.map(({ colorIndex }) => colorIndex)).toEqual([0, 9]);
    expect(rewritten?.base[1]?.alpha).toBeGreaterThan(0);
  });

  // Pendant la mosaïque, les cases qui paraissent passent d'un coup : l'image du moment est celle qu'on voit à la fin
  it("shows the cells that appear during the mosaic at once", () => {
    const world = openScene({ isReady: false });
    world.publish({ isReady: true });
    flush(FRAME_MS * 4);
    expect(lastFrame().reveal).not.toBeNull();

    world.show(rowOf(10, 5, 9));
    flush(SETTLE_MS);

    expect(framesOf().every(({ arriving }) => arriving.length === 0)).toBe(true);
  });

  // Mouvement réduit : tout paraît d'un coup, sans décalage ni image attendue
  it("shows the cells at once when motion is reduced", () => {
    const world = openScene({ isReducedMotion: true });

    world.show(rowOf(10, 5, 9));
    flush(SETTLE_MS);

    expect(framesOf().every(({ arriving }) => arriving.length === 0)).toBe(true);
    expect(world.pendingFrames()).toBe(0);
  });

  // Une modération est immédiate : la case qui changeait en fondu cesse d'être refaite, l'image dit la vérité
  it("stops fading a cell that moderation changed at once, so nothing lingers in the stream", () => {
    const world = openScene();
    flush(SETTLE_MS);
    world.show(rowOf(10, 5, 9));
    flush(FRAME_MS * 3);
    expect(lastFrame().arriving.some(({ x }) => x === 0)).toBe(true);

    world.setPixel(0, 5, 0);
    flush(FRAME_MS);

    expect(lastFrame().arriving.some(({ x }) => x === 0)).toBe(false);
    expect(lastFrame().arriving.some(({ x }) => x === 1)).toBe(true);
  });

  // La taille de la source change : une image, et rien de plus
  it("paints once more when the source changes size, and schedules nothing after", () => {
    const world = openScene();
    flush(SETTLE_MS);
    const before = framesOf().length;

    for (const resize of browser.resizes) resize();
    flush(FRAME_MS * 2);

    expect(framesOf().length).toBe(before + 1);
    expect(world.pendingFrames()).toBe(0);
  });

  // Quand la scène se défait au milieu d'un effet, plus aucune image n'est attendue
  it("schedules nothing once the scene is disposed mid-effect", () => {
    const world = openScene();
    flush(FRAME_MS * 3);

    world.scene.dispose();

    expect(world.pendingFrames()).toBe(0);
  });
});

describe("la source OBS qui suit une autre fresque", () => {
  beforeEach(startBrowser);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // La surface est la même d'une fresque à l'autre : la scène qui s'en va en laisse une copie
  const leave = (handoff: Handoff, element = fakeCanvas()) => {
    const left = openScene({ handoff, element });
    left.scene.dispose();
    return left;
  };

  // Une scène qui a peint laisse une copie de ce que la surface montrait, pas la surface elle-même
  it("leaves a copy of what the surface showed, not the surface itself", () => {
    const handoff = createHandoff();
    const element = fakeCanvas();

    leave(handoff, element);

    expect(handoff.surface).not.toBeNull();
    expect(handoff.surface).not.toBe(element);
    expect(handoff.surface?.width).toBe(element.width);
    expect(handoff.surface?.height).toBe(element.height);
  });

  // Tant que la nouvelle image n'est pas là, la surface garde l'ancienne telle quelle : rien n'est dessiné
  it("draws nothing until the new image is there, so the old fresque stays as it was", () => {
    const handoff = createHandoff();
    const element = fakeCanvas();
    leave(handoff, element);
    probe.frames.length = 0;

    const next = openScene({ isReady: false, handoff, element });
    flush(SETTLE_MS);

    expect(framesOf()).toEqual([]);
    expect(next.pendingFrames()).toBe(0);
  });

  // La nouvelle image arrive : l'ancienne s'efface pendant la première étape seulement
  it("fades the old fresque out during the first step only", () => {
    const handoff = createHandoff();
    const element = fakeCanvas();
    leave(handoff, element);
    const copy = handoff.surface;
    probe.frames.length = 0;
    const next = openScene({ isReady: false, handoff, element });

    next.publish({ isReady: true });
    flush(FRAME_MS);
    expect(lastFrame().ghost).toEqual({ source: copy, alpha: 1 });
    flush(SETTLE_MS);

    const withGhost = framesOf().filter(({ ghost }) => ghost !== null);
    expect(withGhost.length).toBeGreaterThanOrEqual(6);
    expect(withGhost.every(({ reveal }) => reveal?.step === 0)).toBe(true);
    const alphas = withGhost.map(({ ghost }) => ghost?.alpha ?? 0);
    expect(alphas).toEqual([...alphas].sort((a, b) => b - a));
    expect(lastFrame().ghost).toBeNull();
    expect(next.pendingFrames()).toBe(0);
  });

  // Un passage trop ancien est oublié
  it("forgets a handoff that is too old", () => {
    const handoff = createHandoff();
    leave(handoff);
    handoff.leftAt -= 10_000;

    const next = openScene({ isReady: false, handoff });
    next.publish({ isReady: true });
    flush(FRAME_MS);

    expect(lastFrame().ghost).toBeNull();
  });

  // Mouvement réduit : la nouvelle fresque paraît d'un coup, l'ancienne s'en va avec elle
  it("drops the old fresque as soon as the new one is there when motion is reduced", () => {
    const handoff = createHandoff();
    leave(handoff);
    const next = openScene({ isReady: false, handoff, isReducedMotion: true });

    next.publish({ isReady: true });
    flush(SETTLE_MS);

    expect(framesOf().every(({ ghost }) => ghost === null)).toBe(true);
    expect(next.pendingFrames()).toBe(0);
  });

  // Une scène qui n'a rien peint ne laisse rien derrière elle
  it("leaves nothing behind when the scene never painted", () => {
    const handoff = createHandoff();
    const idle = openScene({ isReady: false, handoff });

    idle.scene.dispose();

    expect(handoff.surface).toBeNull();
  });
});
