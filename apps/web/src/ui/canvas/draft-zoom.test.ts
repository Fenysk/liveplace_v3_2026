import { PALETTE } from "@liveplace/domain";
import type { Transport, TransportListeners } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasStore } from "../../state/canvas-store";
import { createDraftStore } from "../../state/draft-store";
import type { DraftStorage } from "../../state/saved-draft";
import { COARSE_POINTER_QUERY } from "../design/use-media-query";
import { createCanvasScene } from "./canvas-scene";
import {
  COMFORTABLE_CELL,
  comfortableCell,
  freeArea,
  isCellTooSmall,
  MIN_VISIBLE_CELLS,
  type Rect,
  tapZoomTarget,
  zoomFrame,
} from "./draft-zoom";
import type { Scene } from "./render-scene";
import {
  type ArrivalZone,
  type Cell,
  fitViewport,
  type Insets,
  NO_INSETS,
  type ScreenPoint,
  type Size,
  type Viewport,
  viewportToCell,
  zoomLimits,
} from "./viewport";

// La scène tourne ici sans navigateur : seules l'image peinte (on y lit le viewport) et la mesure des pills sont remplacées.
type Probe = { frames: Scene[]; arrival: { insets: Insets; zone: ArrivalZone }; draftInsets: Insets };
const probe = vi.hoisted(
  (): Probe => ({
    frames: [],
    arrival: { insets: { top: 0, right: 0, bottom: 0, left: 0 }, zone: "side" },
    draftInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  }),
);
vi.mock("./render-scene", () => ({
  renderScene: (_context: unknown, scene: Scene) => {
    probe.frames.push(scene);
  },
}));
vi.mock("./canvas-image", () => ({ createCanvasImage: () => ({ source: {}, repaint: () => undefined }) }));
vi.mock("./arrival-insets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./arrival-insets")>()),
  measureArrivalInsets: () => probe.arrival,
  measureDraftInsets: () => probe.draftInsets,
  observeZone: () => () => undefined,
}));

const CANVAS = { width: 50, height: 50 };
const PHONE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const LAPTOP = { width: 1440, height: 900 };
// iPhone 13 en paysage (la barre du navigateur retirée) : la colonne du Dessin à droite, la pill Thème en haut, l'encoche aux côtés.
const LANDSCAPE = { width: 844, height: 390 };
const LANDSCAPE_INSETS = { top: 44, right: 375, bottom: 21, left: 47 };
// Sur mobile : la bande Thème en haut, la feuille Dessin en bas.
const DRAFT_INSETS = { top: 96, right: 0, bottom: 220, left: 0 };
const PHONE_VIEW_INSETS = { top: 130, right: 0, bottom: 60, left: 0 };
const LANDSCAPE_VIEW_INSETS = { top: 68, right: 375, bottom: 21, left: 47 };
// Un écran tactile large en portrait (Écart §9.3, JOURNAL 2026-10-09) : en Vue le canvas arrive au-dessus de la colonne, dans toute
// la largeur ; en Dessin le panneau de 320 px prend la droite (336 px avec ses marges).
const DUO = { width: 626, height: 890 };
const ABOVE_COLUMN_INSETS = { top: 164, right: 0, bottom: 128, left: 0 };
const BESIDE_PANEL_INSETS = { top: 116, right: 336, bottom: 8, left: 0 };

const PHONE_ARRIVAL = fitViewport(PHONE, CANVAS, PHONE_VIEW_INSETS);
const PHONE_AREA = freeArea(PHONE, DRAFT_INSETS);
const PHONE_LIMITS = zoomLimits(PHONE, CANVAS);
const LAPTOP_AREA = freeArea(LAPTOP, NO_INSETS);
const LAPTOP_LIMITS = zoomLimits(LAPTOP, CANVAS);
const LANDSCAPE_AREA = freeArea(LANDSCAPE, LANDSCAPE_INSETS);
const LANDSCAPE_ARRIVAL = fitViewport(LANDSCAPE, CANVAS, LANDSCAPE_VIEW_INSETS);
const LANDSCAPE_LIMITS = zoomLimits(LANDSCAPE, CANVAS);

const centerOf = (rect: Rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });

// La même case, avec la même fraction : ce que le zoom doit garder sous le pivot.
const canvasPosition = (viewport: Viewport, point: { x: number; y: number }) => ({
  x: (point.x - viewport.offsetX) / viewport.scale,
  y: (point.y - viewport.offsetY) / viewport.scale,
});

const withScale = (viewport: Viewport, scale: number): Viewport => ({ ...viewport, scale });

// Un carré de cases, du coin (x, y), de `size` cases de côté : seuls les coins comptent pour le rectangle englobant.
const draftSquare = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size - 1, y: y + size - 1 },
];

describe("COMFORTABLE_CELL, Écart §9.3 (JOURNAL 2026-10-08)", () => {
  // Le doigt est plus grossier que la souris : seuil et cible y sont plus grands, et la cible dépasse toujours le seuil
  it("asks a finger for bigger cells than a mouse, and aims past its own threshold", () => {
    expect(COMFORTABLE_CELL.coarse.min).toBeGreaterThan(COMFORTABLE_CELL.fine.min);
    expect(COMFORTABLE_CELL.coarse.target).toBeGreaterThan(COMFORTABLE_CELL.fine.target);
    for (const { min, target } of Object.values(COMFORTABLE_CELL)) expect(target).toBeGreaterThan(min);
  });
});

describe("comfortableCell, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  // Une zone libre haute ou large garde la cible du pointeur : le PC et une tablette ne changent pas
  it("keeps the pointer's own target on a roomy free area", () => {
    expect(comfortableCell("fine", LAPTOP_AREA)).toBe(COMFORTABLE_CELL.fine.target);
    expect(comfortableCell("coarse", freeArea({ width: 1000, height: 800 }, NO_INSETS))).toBe(
      COMFORTABLE_CELL.coarse.target,
    );
  });

  // Sur la zone d'un téléphone en paysage, la cible baisse pour montrer au moins autant de cases sur le petit côté que la minimale
  it("shrinks the target so the short side shows at least the minimum number of cells", () => {
    const cell = comfortableCell("coarse", LANDSCAPE_AREA);
    expect(cell).toBeLessThan(COMFORTABLE_CELL.coarse.target);
    expect(cell).toBeGreaterThan(COMFORTABLE_CELL.coarse.min);
    expect(325 / cell).toBeCloseTo(MIN_VISIBLE_CELLS.coarse);
  });

  // Un téléphone en portrait est presque inchangé : 375 px de large montrent déjà 13 cases à 28 px
  it("barely changes a portrait phone", () => {
    expect(comfortableCell("coarse", PHONE_AREA)).toBeGreaterThan(COMFORTABLE_CELL.coarse.target * 0.9);
  });

  // Une zone minuscule ne descend jamais sous le seuil de confort : cette taille-là est le plancher
  it("never goes under the comfort threshold, however small the area", () => {
    expect(comfortableCell("coarse", freeArea({ width: 300, height: 120 }, NO_INSETS))).toBe(
      COMFORTABLE_CELL.coarse.min,
    );
    expect(comfortableCell("fine", freeArea({ width: 200, height: 100 }, NO_INSETS))).toBe(
      COMFORTABLE_CELL.fine.min,
    );
  });

  // Une zone sans place (des marges plus grandes que l'écran) donne le plancher, pas une valeur négative
  it("gives the floor to an area with no room", () => {
    const empty = freeArea({ width: 300, height: 200 }, { top: 150, right: 200, bottom: 150, left: 200 });
    expect(comfortableCell("coarse", empty)).toBe(COMFORTABLE_CELL.coarse.min);
  });
});

describe("isCellTooSmall, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  // Une même vue est assez grande pour la souris et trop petite pour le doigt
  it("judges one view by the pointer: enough for a mouse, too small for a finger", () => {
    const view = withScale(
      fitViewport(LAPTOP, CANVAS),
      (COMFORTABLE_CELL.fine.min + COMFORTABLE_CELL.coarse.min) / 2,
    );
    expect(isCellTooSmall(view, "fine")).toBe(false);
    expect(isCellTooSmall(view, "coarse")).toBe(true);
  });

  // Au seuil, la case est assez grande : seule une case en dessous est trop petite
  it("calls a cell too small only under the threshold", () => {
    const { min } = COMFORTABLE_CELL.coarse;
    expect(isCellTooSmall(withScale(PHONE_ARRIVAL, min - 0.1), "coarse")).toBe(true);
    expect(isCellTooSmall(withScale(PHONE_ARRIVAL, min), "coarse")).toBe(false);
  });
});

// Le navigateur que la scène lit, joué à la main : le temps des images, les observateurs, les attributs de <html>, les médias.
const FRAME_MS = 16;
// Plus que la durée de `--lp-dur` (340 ms) : un zoom animé a eu le temps d'arriver.
const SETTLE_MS = 600;
const NOW = 1_700_000_000_000;
const DRAFT_KEY = "liveplace:draft:canvas-1:user-1";
const NO_OP = (): void => undefined;

type ResizeCallback = (entries: { contentRect: Size }[]) => void;
type PointerLike = Pick<PointerEvent, "pointerId" | "pointerType" | "button" | "clientX" | "clientY">;

const browser = {
  now: 0,
  lastFrameId: 0,
  frames: new Map<number, (time: number) => void>(),
  resizes: [] as ResizeCallback[],
  mutations: [] as { run: () => void; attributes: readonly string[] }[],
  attributes: new Set<string>(),
  isCoarse: false,
  isReducedMotion: false,
};

class FakeResizeObserver {
  constructor(callback: ResizeCallback) {
    browser.resizes.push(callback);
  }
  observe = NO_OP;
  disconnect = NO_OP;
}

class FakeMutationObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe = (_target: unknown, options: { attributeFilter?: string[] }) => {
    browser.mutations.push({ run: this.callback, attributes: options.attributeFilter ?? [] });
  };
  disconnect = NO_OP;
}

// Les jetons que la scène lit sur <html> : la durée et la courbe de tokens.css, ou 0 en mouvement réduit.
const cssValue = (name: string): string => {
  if (name === "--lp-dur") return browser.isReducedMotion ? "0s" : "0.34s";
  return name === "--lp-ease" ? "cubic-bezier(0.2, 0.8, 0.2, 1)" : "";
};

const matches = (query: string): boolean =>
  query === COARSE_POINTER_QUERY
    ? browser.isCoarse
    : query.includes("prefers-reduced-motion") && browser.isReducedMotion;

const startBrowser = () => {
  browser.now = 0;
  browser.frames.clear();
  browser.resizes.length = 0;
  browser.mutations.length = 0;
  browser.attributes.clear();
  probe.frames.length = 0;
  const root = {
    toggleAttribute: (name: string, force?: boolean) => {
      if (force) browser.attributes.add(name);
      else browser.attributes.delete(name);
      return force === true;
    },
    hasAttribute: (name: string) => browser.attributes.has(name),
    removeAttribute: (name: string) => {
      browser.attributes.delete(name);
    },
  };
  vi.stubGlobal("window", {
    devicePixelRatio: 2,
    matchMedia: (query: string) => ({ matches: matches(query) }),
  });
  vi.stubGlobal("document", { documentElement: root });
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
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
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

// Les pills ont changé de taille : <html> a changé d'attribut `style`, comme le fait pill.tsx.
const resizePills = () => {
  for (const { run, attributes } of browser.mutations) if (attributes.includes("style")) run();
};

const lastFrame = (): Scene => {
  const frame = probe.frames.at(-1);
  if (!frame) throw new Error("aucune image n'a été peinte");
  return frame;
};

// Node n'a pas de DOM : un faux élément ne porte que ce que la scène lit. Le vrai élément est de ce type, et le compilateur
// le vérifie à l'assertion qui suit : aucun membre ne peut diverger sans qu'il le dise.
type FakeLayer = {
  style: Pick<CSSStyleDeclaration, "setProperty">;
  animate: (...args: never[]) => Pick<Animation, "cancel">;
};
type FakeSurface = Pick<HTMLCanvasElement, "width" | "height" | "clientWidth" | "clientHeight"> & {
  getContext: (...args: never[]) => object | null;
  setPointerCapture: (...args: never[]) => void;
  addEventListener: (...args: never[]) => void;
};

const fakeLayer: FakeLayer = { style: { setProperty: NO_OP }, animate: () => ({ cancel: NO_OP }) };
const LAYER = fakeLayer as HTMLElement;

const createSurface = () => {
  const addEventListener = vi.fn<(type: string, listener: (event: PointerLike) => void) => void>();
  const fakeSurface: FakeSurface = {
    width: 0,
    height: 0,
    clientWidth: 0,
    clientHeight: 0,
    getContext: () => ({}),
    setPointerCapture: NO_OP,
    addEventListener,
  };
  const dispatch = (type: string, event: PointerLike) => {
    for (const [name, listener] of addEventListener.mock.calls) if (name === type) listener(event);
  };
  return { element: fakeSurface as HTMLCanvasElement, dispatch };
};

const welcomeOf = (canvas: Size): ServerFrame => ({
  t: "welcome",
  canvas: { canvasId: "canvas-1", width: canvas.width, height: canvas.height, ownerId: "owner-1" },
  params: {
    gaugeMaxStart: 10,
    gaugeMaxCeiling: 150,
    refillMs: 10_000,
    refillCharges: 1,
    obsDelayMs: 5000,
    obsBackground: "transparent",
  },
  palette: [...PALETTE],
  version: 7,
  you: { userId: "user-1", login: "user1", displayName: "User 1", role: "viewer" },
  gauge: { charges: 10, max: 10, nextRefillAt: NOW + 10_000, claimable: 0 },
});

// Un écran comme la page le mesure : le pointeur, les marges des pills en Vue (et la zone d'arrivée), puis celles du Dessin.
type Place = {
  screen: Size;
  isTouch: boolean;
  arrival: { insets: Insets; zone: ArrivalZone };
  draftInsets: Insets;
};

const PHONE_PLACE: Place = {
  screen: PHONE,
  isTouch: true,
  arrival: { insets: PHONE_VIEW_INSETS, zone: "side" },
  draftInsets: DRAFT_INSETS,
};
const LANDSCAPE_PLACE: Place = {
  screen: LANDSCAPE,
  isTouch: true,
  arrival: { insets: LANDSCAPE_VIEW_INSETS, zone: "side" },
  draftInsets: LANDSCAPE_INSETS,
};
const DUO_PLACE: Place = {
  screen: DUO,
  isTouch: true,
  arrival: { insets: ABOVE_COLUMN_INSETS, zone: "above" },
  draftInsets: BESIDE_PANEL_INSETS,
};
const TABLET_PLACE: Place = { ...DUO_PLACE, screen: TABLET };
const LAPTOP_PLACE: Place = {
  screen: LAPTOP,
  isTouch: false,
  arrival: { insets: NO_INSETS, zone: "side" },
  draftInsets: NO_INSETS,
};
// Sur le PC, 256 cases de côté tiennent à 3 px la case.
const BIG_CANVAS = { width: 256, height: 256 };

type Options = { canvas?: Size; draft?: readonly Cell[]; isReducedMotion?: boolean };

// La vraie scène, sur de vrais stores : le joueur est connecté, la page arrive à son cadrage, `draft` est son brouillon gardé.
const openScene = (place: Place, { canvas = CANVAS, draft = [], isReducedMotion = false }: Options = {}) => {
  probe.arrival = place.arrival;
  probe.draftInsets = place.draftInsets;
  browser.isCoarse = place.isTouch;
  browser.isReducedMotion = isReducedMotion;
  const listening: { listeners?: TransportListeners } = {};
  const transport: Transport = {
    send: () => undefined,
    listen: (listeners) => {
      listening.listeners = listeners;
    },
    close: () => undefined,
  };
  const store = createCanvasStore("canvas-1", transport, {
    mode: "ui",
    now: () => NOW,
    reload: () => undefined,
  });
  listening.listeners?.onOpen();
  listening.listeners?.onFrame(welcomeOf(canvas));
  const saved = new Map<string, string>();
  if (draft.length > 0)
    saved.set(DRAFT_KEY, JSON.stringify(draft.map(({ x, y }) => ({ x, y, colorIndex: 3 }))));
  const storage: DraftStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => {
      saved.set(key, value);
    },
  };
  const draftStore = createDraftStore("canvas-1", store, () => storage, {
    now: () => NOW,
    wait: async () => undefined,
  });
  const hooks = { onViewportMove: vi.fn(), onFraming: vi.fn(), onGesture: vi.fn(), onNavigate: vi.fn() };
  const surface = createSurface();
  const scene = createCanvasScene(surface.element, store, draftStore, {
    initialViewport: null,
    isFramedInFreeArea: true,
    ...hooks,
    checker: LAYER,
    checkerTiles: LAYER,
  });
  browser.resizes[0]?.([{ contentRect: place.screen }]);
  flush(FRAME_MS);
  const press = (type: string, point: ScreenPoint) =>
    surface.dispatch(type, {
      pointerId: 1,
      pointerType: place.isTouch ? "touch" : "mouse",
      button: 0,
      clientX: point.x,
      clientY: point.y,
    });
  return {
    store,
    draftStore,
    scene,
    hooks,
    view: (): Viewport => lastFrame().viewport,
    shownDraft: () => lastFrame().draft.length,
    moves: () => hooks.onViewportMove.mock.calls.length,
    pendingFrames: () => browser.frames.size,
    enterDraft: () => {
      draftStore.enterDraftMode();
      flush(SETTLE_MS);
    },
    exitDraft: () => {
      draftStore.exitDraftMode();
      flush(SETTLE_MS);
    },
    tap: (point: ScreenPoint) => {
      press("pointerdown", point);
      press("pointerup", point);
    },
    drag: (from: ScreenPoint, to: ScreenPoint) => {
      press("pointerdown", from);
      press("pointermove", to);
      press("pointerup", to);
    },
  };
};

describe("la scène du canvas à l'entrée en Dessin, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  beforeEach(startBrowser);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Un téléphone aux cases de 7 px, que l'entrée zoomait jusqu'à 27 px : la vue est la même, au pixel près
  it("leaves the view of a phone with tiny cells exactly as it was", () => {
    const world = openScene(PHONE_PLACE);
    const before = world.view();
    expect(isCellTooSmall(before, "coarse")).toBe(true);

    world.enterDraft();

    expect(world.draftStore.getView().mode).toBe("draft");
    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Un brouillon gardé que l'entrée allait centrer : il se voit, la vue reste où la Vue l'avait mise
  it("does not go to a kept draft: it shows where the view already is", () => {
    const draft = draftSquare(5, 40, 4);
    const world = openScene(PHONE_PLACE, { draft });
    const before = world.view();

    world.enterDraft();

    expect(world.shownDraft()).toBe(draft.length);
    expect(world.view()).toEqual(before);
  });

  // Une vue glissée, le brouillon hors de l'écran : l'entrée ne la ramène pas
  it("leaves a panned view alone, with the draft out of sight", () => {
    const world = openScene(PHONE_PLACE, { draft: draftSquare(1, 1, 2) });
    world.drag({ x: 300, y: 400 }, { x: 40, y: 400 });
    flush(FRAME_MS);
    const before = world.view();
    const moves = world.moves();
    expect(before.offsetX + 2 * before.scale).toBeLessThan(0);

    world.enterDraft();

    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(moves);
  });

  // Des cases déjà grandes et un brouillon loin : l'entrée glissait jusqu'à lui, plus maintenant
  it("does not slide to a draft out of sight when the cells are already big", () => {
    const world = openScene(PHONE_PLACE, { draft: draftSquare(2, 2, 2) });
    world.scene.zoomBy(4);
    flush(SETTLE_MS);
    const before = world.view();
    expect(isCellTooSmall(before, "coarse")).toBe(false);
    expect(before.offsetX + 2 * before.scale).toBeLessThan(0);

    world.enterDraft();

    expect(world.view()).toEqual(before);
  });

  // Un téléphone en paysage, la colonne du Dessin à droite : la vue ne se recentre pas à gauche du panneau
  it("leaves a landscape phone's view alone, beside the side panel", () => {
    const world = openScene(LANDSCAPE_PLACE);
    const before = world.view();
    expect(before).toEqual(LANDSCAPE_ARRIVAL);

    world.enterDraft();

    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Le même téléphone avec un brouillon : il ne vient plus entre l'encoche et la colonne
  it("leaves a landscape phone's view alone with a kept draft", () => {
    const draft = draftSquare(2, 2, 4);
    const world = openScene(LANDSCAPE_PLACE, { draft });
    const before = world.view();

    world.enterDraft();

    expect(world.shownDraft()).toBe(draft.length);
    expect(world.view()).toEqual(before);
  });

  // Un écran tactile large où le canvas arrive au-dessus de la colonne : le milieu de la Vue ne passe plus à gauche du panneau
  it("leaves the view of a wide touch screen framed above the column alone", () => {
    const world = openScene(DUO_PLACE);
    const before = world.view();
    expect(before).toEqual(fitViewport(DUO, CANVAS, ABOVE_COLUMN_INSETS));

    world.enterDraft();

    expect(world.view()).toEqual(before);
    expect(world.pendingFrames()).toBe(0);
  });

  // Une tablette en portrait et un brouillon : la vue ne bouge pas non plus, le panneau couvre ce qu'il couvre
  it("leaves a tablet's view alone with a kept draft, wherever the panel falls", () => {
    const world = openScene(TABLET_PLACE, { draft: draftSquare(30, 30, 5) });
    const before = world.view();

    world.enterDraft();

    expect(world.shownDraft()).toBe(2);
    expect(world.view()).toEqual(before);
  });

  // Un PC, la souris : des cases sous les 10 px qu'elle demande, et rien ne bouge non plus
  it("leaves a PC's view alone, even with cells under the mouse's threshold", () => {
    const world = openScene(LAPTOP_PLACE, { canvas: BIG_CANVAS });
    const before = world.view();
    expect(isCellTooSmall(before, "fine")).toBe(true);

    world.enterDraft();

    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Le PC avec un brouillon loin du centre : de même
  it("leaves a PC's view alone with a kept draft far from the middle", () => {
    const world = openScene(LAPTOP_PLACE, { canvas: BIG_CANVAS, draft: draftSquare(240, 10, 3) });
    const before = world.view();

    world.enterDraft();

    expect(world.shownDraft()).toBe(2);
    expect(world.view()).toEqual(before);
  });

  // Mouvement réduit : l'entrée sautait à sa vue d'arrivée, elle ne saute plus nulle part
  it("does not jump either when motion is reduced", () => {
    const world = openScene(PHONE_PLACE, { isReducedMotion: true, draft: draftSquare(5, 40, 4) });
    const before = world.view();

    world.enterDraft();

    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Aucune animation ne part à l'entrée : une fois la feuille peinte, plus aucune image n'est attendue, et la vue gardée n'est pas réécrite
  it("starts no animation: nothing is scheduled once the first frames are painted", () => {
    const world = openScene(PHONE_PLACE);

    world.draftStore.enterDraftMode();
    flush(FRAME_MS * 2);

    expect(world.pendingFrames()).toBe(0);
    expect(world.moves()).toBe(0);
  });

  // Sortir du Dessin ne bouge pas la vue, comme avant, ni les entrées suivantes avec le brouillon gardé
  it("leaves the view alone when leaving, and at every entry after it", () => {
    const world = openScene(PHONE_PLACE, { draft: draftSquare(5, 40, 4) });
    const before = world.view();

    world.enterDraft();
    world.exitDraft();
    expect(world.draftStore.getView().mode).toBe("view");
    expect(world.view()).toEqual(before);

    world.enterDraft();
    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Un zoom déjà en route (le bouton +) n'est ni coupé ni détourné par l'entrée : il va jusqu'à son but
  it("lets a zoom already under way run on to its goal", () => {
    const world = openScene(PHONE_PLACE);
    const before = world.view();
    const pivot = { x: PHONE.width / 2, y: PHONE.height / 2 };
    world.scene.zoomBy(2);
    flush(FRAME_MS * 3);
    expect(world.view().scale).toBeGreaterThan(before.scale);
    expect(world.view().scale).toBeLessThan(before.scale * 2);

    world.enterDraft();

    expect(world.view().scale).toBeCloseTo(before.scale * 2);
    expect(canvasPosition(world.view(), pivot).x).toBeCloseTo(canvasPosition(before, pivot).x);
    expect(canvasPosition(world.view(), pivot).y).toBeCloseTo(canvasPosition(before, pivot).y);
  });

  // La bande Thème, plus étroite à côté du panneau, passe sur deux lignes en Dessin : les marges changent, la vue reste (garde de la scène)
  it("keeps the view when the pills change size in Draft mode, as the Theme band wraps", () => {
    const world = openScene(DUO_PLACE);
    const before = world.view();
    world.enterDraft();

    probe.arrival = { zone: "above", insets: { ...ABOVE_COLUMN_INSETS, top: 184 } };
    resizePills();
    flush(SETTLE_MS);

    expect(world.view()).toEqual(before);
    expect(world.moves()).toBe(0);
  });

  // Hors du Dessin les mêmes marges recadrent la vue restée à l'arrivée : la garde ne vaut que pour le Dessin, et la scène voit bien un mouvement
  it("reframes an arrival view for the same change of margins in Vue", () => {
    const world = openScene(DUO_PLACE);
    const before = world.view();
    const taller = { ...ABOVE_COLUMN_INSETS, top: 184 };

    probe.arrival = { zone: "above", insets: taller };
    resizePills();
    flush(SETTLE_MS);

    expect(world.view()).toEqual(fitViewport(DUO, CANVAS, taller));
    expect(world.view()).not.toEqual(before);
  });

  // Le bouton + anime toujours la vue jusqu'à son but, autour du centre de l'écran
  it("still animates the plus button to its goal around the screen's center", () => {
    const world = openScene(PHONE_PLACE);
    const before = world.view();
    const pivot = { x: PHONE.width / 2, y: PHONE.height / 2 };

    world.scene.zoomBy(1.5);
    flush(FRAME_MS * 3);
    expect(world.view().scale).toBeLessThan(before.scale * 1.5);
    flush(SETTLE_MS);

    expect(world.view().scale).toBeCloseTo(before.scale * 1.5);
    expect(canvasPosition(world.view(), pivot).x).toBeCloseTo(canvasPosition(before, pivot).x);
  });

  // Recentrer ramène la vue à l'arrivée en douceur, et replie la pill Canvas comme un déplacement
  it("brings Recenter back to the arrival view and folds the Canvas pill", () => {
    const world = openScene(PHONE_PLACE);
    const arrival = world.view();
    world.scene.zoomBy(3);
    flush(SETTLE_MS);
    expect(world.view()).not.toEqual(arrival);
    const gestures = world.hooks.onGesture.mock.calls.length;

    world.scene.recenter();
    flush(SETTLE_MS);

    expect(world.view()).toEqual(arrival);
    expect(world.hooks.onGesture).toHaveBeenCalledTimes(gestures + 1);
  });
});

describe("le toucher d'une case trop petite, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  const tapped = { x: 131, y: 311 };

  beforeEach(startBrowser);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // En Vue, le doigt sur une case de 7 px zoome sous lui jusqu'à la taille confortable, au lieu d'inspecter
  it("still zooms under the finger in Vue instead of inspecting", () => {
    const world = openScene(PHONE_PLACE);
    const before = world.view();

    world.tap(tapped);
    flush(SETTLE_MS);

    const after = world.view();
    expect(after.scale).toBeCloseTo(comfortableCell("coarse", freeArea(PHONE, PHONE_VIEW_INSETS)));
    expect(viewportToCell(after, tapped, CANVAS)).toEqual(viewportToCell(before, tapped, CANVAS));
    expect(world.store.getView().inspection).toBeNull();
    expect(world.hooks.onNavigate).toHaveBeenCalledWith("zoom");
  });

  // Une fois la case assez grande, le toucher suivant inspecte et la vue ne bouge plus
  it("inspects at the next touch, once the cell is big enough", () => {
    const world = openScene(PHONE_PLACE);
    world.tap(tapped);
    flush(SETTLE_MS);
    const zoomed = world.view();
    const cell = viewportToCell(zoomed, tapped, CANVAS);

    world.tap(tapped);
    flush(SETTLE_MS);

    expect(world.view()).toEqual(zoomed);
    expect(world.store.getView().inspection).toMatchObject({ status: "loading", x: cell?.x, y: cell?.y });
  });

  // En Dessin, le toucher sert au brouillon : la case y entre, la vue ne zoome pas
  it("keeps serving the draft in Draft mode: the cell goes in, the view stays", () => {
    const world = openScene(PHONE_PLACE);
    world.enterDraft();
    const before = world.view();

    world.tap(tapped);
    flush(SETTLE_MS);

    expect(world.draftStore.getView().draft.size).toBe(1);
    expect(world.view()).toEqual(before);
  });

  // La souris a son propre seuil, et vise sa propre taille : 16 px, jamais les 28 px du doigt
  it("lets a mouse zoom to its own smaller target on tiny cells", () => {
    const world = openScene(LAPTOP_PLACE, { canvas: BIG_CANVAS });

    world.tap({ x: 700, y: 400 });
    flush(SETTLE_MS);

    expect(world.view().scale).toBeCloseTo(COMFORTABLE_CELL.fine.target);
    expect(world.store.getView().inspection).toBeNull();
  });
});

describe("draft-zoom, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  // Plus de zoom d'entrée en Dessin dans le module : ne restent les tailles de confort, le zoom du toucher et l'animation
  it("keeps no entry zoom: only the comfort sizes, the tap zoom and the animation", async () => {
    const names = Object.keys(await import("./draft-zoom")).sort();

    expect(names).toEqual([
      "COMFORTABLE_CELL",
      "MIN_VISIBLE_CELLS",
      "comfortableCell",
      "freeArea",
      "isCellTooSmall",
      "tapZoomTarget",
      "zoomFrame",
    ]);
  });
});

describe("zoomFrame, Écart §9.3 (JOURNAL 2026-10-08)", () => {
  const from = PHONE_ARRIVAL;
  const pivot = centerOf(PHONE_AREA);
  const to = tapZoomTarget(from, pivot, "coarse", PHONE_AREA, PHONE_LIMITS) ?? from;

  // À 0 la vue est celle de départ, à 1 celle d'arrivée, au pixel près
  it("starts at the first view and ends at the second one", () => {
    expect(to.scale).toBeGreaterThan(from.scale);
    expect(zoomFrame(from, to, 0)).toEqual(from);
    expect(zoomFrame(from, to, 1)).toEqual(to);
  });

  // Le zoom avance à rythme constant : à mi-chemin, l'échelle est la moyenne géométrique des deux
  it("zooms at a steady rate: halfway, the scale is the geometric mean", () => {
    expect(zoomFrame(from, to, 0.5).scale).toBeCloseTo(Math.sqrt(from.scale * to.scale));
  });

  // À chaque image, le point sous le pivot reste sous le pivot, et l'échelle ne fait que croître
  it("keeps the point under the pivot fixed at every frame, and only grows", () => {
    const fixed = canvasPosition(from, pivot);
    let previousScale = 0;
    for (let step = 0; step <= 20; step += 1) {
      const frame = zoomFrame(from, to, step / 20);
      const position = canvasPosition(frame, pivot);
      expect(position.x).toBeCloseTo(fixed.x);
      expect(position.y).toBeCloseTo(fixed.y);
      expect(frame.scale).toBeGreaterThanOrEqual(previousScale);
      previousScale = frame.scale;
    }
  });

  // Sans changement d'échelle, la vue glisse en ligne droite de l'une à l'autre
  it("slides in a straight line when the scale does not change", () => {
    const moved = { ...from, offsetX: from.offsetX + 100 };
    expect(zoomFrame(from, moved, 0.25).offsetX).toBeCloseTo(from.offsetX + 25);
    expect(zoomFrame(from, moved, 0.25).scale).toBe(from.scale);
  });

  // Un toucher hors du centre : le point que la vue d'arrivée garde fixe est le point touché, et l'est à chaque image
  it("keeps the touched point of a tap zoom fixed at every frame", () => {
    const touched = { x: 90, y: 480 };
    const toward = tapZoomTarget(from, touched, "coarse", PHONE_AREA, PHONE_LIMITS);
    if (!toward) throw new Error("un zoom était attendu");
    const ratio = toward.scale / from.scale;
    const fixedPoint = {
      x: (toward.offsetX - from.offsetX * ratio) / (1 - ratio),
      y: (toward.offsetY - from.offsetY * ratio) / (1 - ratio),
    };
    expect(fixedPoint.x).toBeCloseTo(touched.x);
    expect(fixedPoint.y).toBeCloseTo(touched.y);
    const fixed = canvasPosition(from, fixedPoint);
    for (let step = 1; step < 20; step += 1) {
      const position = canvasPosition(zoomFrame(from, toward, step / 20), fixedPoint);
      expect(position.x).toBeCloseTo(fixed.x);
      expect(position.y).toBeCloseTo(fixed.y);
    }
  });
});

describe("tapZoomTarget, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  const tapped = { x: 120, y: 300 };

  // Un toucher sur une case trop petite : la vue vise la taille confortable de la zone libre, au lieu d'inspecter
  it("zooms to the free area's comfortable cell size when the cell is too small to aim at", () => {
    const target = tapZoomTarget(PHONE_ARRIVAL, tapped, "coarse", PHONE_AREA, PHONE_LIMITS);
    expect(target?.scale).toBeCloseTo(comfortableCell("coarse", PHONE_AREA));
  });

  // Le point touché reste sous le doigt : la même case, à la même fraction près
  it("keeps the touched point under the finger", () => {
    const target = tapZoomTarget(PHONE_ARRIVAL, tapped, "coarse", PHONE_AREA, PHONE_LIMITS);
    if (!target) throw new Error("un zoom était attendu");
    const before = canvasPosition(PHONE_ARRIVAL, tapped);
    const after = canvasPosition(target, tapped);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(viewportToCell(target, tapped, CANVAS)).toEqual(viewportToCell(PHONE_ARRIVAL, tapped, CANVAS));
  });

  // Une case assez grande s'inspecte : au seuil et au-delà, pas de zoom
  it("leaves a big enough cell to the inspection: at the threshold and past it", () => {
    const { min } = COMFORTABLE_CELL.coarse;
    expect(
      tapZoomTarget(withScale(PHONE_ARRIVAL, min), tapped, "coarse", PHONE_AREA, PHONE_LIMITS),
    ).toBeNull();
    expect(
      tapZoomTarget(withScale(PHONE_ARRIVAL, 40), tapped, "coarse", PHONE_AREA, PHONE_LIMITS),
    ).toBeNull();
  });

  // Après le zoom, la case est assez grande : le toucher suivant n'a plus rien à zoomer, il inspecte
  it("zooms once: the touch after the zoom inspects", () => {
    const first = tapZoomTarget(PHONE_ARRIVAL, tapped, "coarse", PHONE_AREA, PHONE_LIMITS);
    if (!first) throw new Error("un zoom était attendu");
    expect(isCellTooSmall(first, "coarse")).toBe(false);
    expect(tapZoomTarget(first, tapped, "coarse", PHONE_AREA, PHONE_LIMITS)).toBeNull();
  });

  // La souris a un seuil plus bas : la même vue est assez grande pour elle, trop petite pour le doigt
  it("judges the cell by the pointer: a mouse inspects where a finger zooms", () => {
    const view = withScale(fitViewport(LAPTOP, CANVAS), 14);
    const point = { x: 720, y: 450 };
    expect(tapZoomTarget(view, point, "fine", LAPTOP_AREA, LAPTOP_LIMITS)).toBeNull();
    expect(tapZoomTarget(view, point, "coarse", LAPTOP_AREA, LAPTOP_LIMITS)).not.toBeNull();
  });

  // Sur un écran bas, la cible suit la zone libre : un téléphone en paysage ne va pas à 28 px
  it("aims at a smaller cell on a landscape phone's free area", () => {
    const target = tapZoomTarget(LANDSCAPE_ARRIVAL, tapped, "coarse", LANDSCAPE_AREA, LANDSCAPE_LIMITS);
    expect(target?.scale).toBeCloseTo(comfortableCell("coarse", LANDSCAPE_AREA));
    expect(target?.scale).toBeLessThan(COMFORTABLE_CELL.coarse.target);
  });

  // Le zoom maximal est respecté, et à ce plafond il n'y a plus rien à zoomer : le toucher inspecte
  it("never goes past the maximum zoom, and inspects once at it", () => {
    const small = withScale(PHONE_ARRIVAL, 6);
    expect(
      tapZoomTarget(small, tapped, "coarse", PHONE_AREA, { minScale: 1, maxScale: 12 })?.scale,
    ).toBeCloseTo(12);
    expect(
      tapZoomTarget(withScale(small, 12), tapped, "coarse", PHONE_AREA, { minScale: 1, maxScale: 12 }),
    ).toBeNull();
  });
});

describe("freeArea, Écart §9.3 (JOURNAL 2026-10-09)", () => {
  // Sans marges, tout l'écran ; avec elles, l'espace libre entre la bande du haut, la feuille du bas et les côtés
  it("is the whole screen without insets, and the space left by the insets with them", () => {
    expect(freeArea(PHONE, NO_INSETS)).toEqual({ left: 0, top: 0, right: 375, bottom: 812 });
    expect(freeArea(PHONE, DRAFT_INSETS)).toEqual({ left: 0, top: 96, right: 375, bottom: 592 });
    expect(freeArea(LANDSCAPE, LANDSCAPE_INSETS)).toEqual({ left: 47, top: 44, right: 469, bottom: 369 });
  });
});
