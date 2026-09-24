// Les gestes sur le canvas (CDC 2026) : pour chaque événement de pointeur, ne rien faire, déplacer, pincer, viser une case, ou tracer.
// Sans DOM : la scène ne fait que brancher les événements du navigateur.

import type { ScreenPoint } from "./viewport";

export type PointerInput = { pointerId: number; pointerType: string; button: number; point: ScreenPoint };

export type Gesture =
  | { kind: "none" }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "zoom"; point: ScreenPoint; factor: number }
  | { kind: "pinch"; dx: number; dy: number; point: ScreenPoint; factor: number }
  | { kind: "target"; point: ScreenPoint }
  | { kind: "trace"; point: ScreenPoint }
  | { kind: "traceEnd" };

export type GestureTracker = {
  press(input: PointerInput): Gesture;
  move(input: PointerInput): Gesture;
  release(input: PointerInput): Gesture;
  cancel(pointerId: number): Gesture;
};

// `isTouchTracing` : le Toggle tracé est actif, un doigt trace au lieu de glisser.
export type GestureOptions = { isTouchTracing(): boolean };

// Sous la tolérance, c'est un clic ou un toucher ; au-delà, un glissement. Le doigt tremble plus que la souris.
const MOUSE_TOLERANCE = 4;
const TOUCH_TOLERANCE = 8;
const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;

// Un cran de molette (100 px) zoome d'environ 16 %. Le pincement du trackpad arrive en `ctrlKey`, par petits pas ;
// Ctrl + molette de souris prend le même chemin, et c'est voulu : un zoom rapide (CDC 2026).
const WHEEL_SPEED = 0.0015;
const TRACKPAD_PINCH_SPEED = 0.01;
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 800;

type TrackedPointer = {
  start: ScreenPoint;
  last: ScreenPoint;
  tolerance: number;
  isDragging: boolean;
  isTracing: boolean;
};

const NONE: Gesture = { kind: "none" };
const TRACE_END: Gesture = { kind: "traceEnd" };

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: ScreenPoint, b: ScreenPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Le premier pas au-delà de la tolérance rattrape tout le chemin depuis l'appui : le canvas reste sous le doigt.
const drag = (pointer: TrackedPointer, point: ScreenPoint): Gesture => {
  if (!pointer.isDragging && distance(pointer.start, point) <= pointer.tolerance) return NONE;
  pointer.isDragging = true;
  const gesture: Gesture = { kind: "pan", dx: point.x - pointer.last.x, dy: point.y - pointer.last.y };
  pointer.last = point;
  return gesture;
};

// Le point entre les doigts se déplace avec eux, et l'écart entre eux donne le zoom.
const pinch = (
  pair: [TrackedPointer, TrackedPointer],
  moved: TrackedPointer,
  point: ScreenPoint,
): Gesture => {
  const [a, b] = pair;
  const previousMiddle = midpoint(a.last, b.last);
  const previousSpread = distance(a.last, b.last);
  moved.last = point;
  const middle = midpoint(a.last, b.last);
  return {
    kind: "pinch",
    dx: middle.x - previousMiddle.x,
    dy: middle.y - previousMiddle.y,
    point: middle,
    factor: previousSpread > 0 ? distance(a.last, b.last) / previousSpread : 1,
  };
};

export function createGestureTracker(
  options: GestureOptions = { isTouchTracing: () => false },
): GestureTracker {
  const pointers = new Map<number, TrackedPointer>();

  const pinchPair = (): [TrackedPointer, TrackedPointer] | null => {
    const [a, b] = pointers.values();
    return a && b ? [a, b] : null;
  };

  // Deux doigts posés pincent : aucun des deux ne sera plus un toucher, et un tracé en cours s'arrête.
  const startPinch = (): Gesture => {
    let wasTracing = false;
    for (const pointer of pointers.values()) {
      wasTracing ||= pointer.isTracing;
      pointer.isDragging = true;
      pointer.isTracing = false;
    }
    return wasTracing ? TRACE_END : NONE;
  };

  return {
    press({ pointerId, pointerType, button, point }) {
      // Le clic droit ne fait rien, et un troisième doigt non plus.
      if (button !== PRIMARY_BUTTON && button !== MIDDLE_BUTTON) return NONE;
      if (pointers.size === 2) return NONE;
      const isTracing = pointerType === "touch" && pointers.size === 0 && options.isTouchTracing();
      pointers.set(pointerId, {
        start: point,
        last: point,
        tolerance: pointerType === "mouse" ? MOUSE_TOLERANCE : TOUCH_TOLERANCE,
        // Le clic molette glisse dès l'appui : il ne vise jamais de case.
        isDragging: button === MIDDLE_BUTTON,
        isTracing,
      });
      if (pointers.size === 2) return startPinch();
      return isTracing ? { kind: "trace", point } : NONE;
    },
    move({ pointerId, pointerType, point }) {
      const pointer = pointers.get(pointerId);
      // Sans appui, seule une souris ou un stylet survole : la case dessous est visée.
      if (!pointer) return pointerType === "touch" ? NONE : { kind: "target", point };
      if (pointer.isTracing) return { kind: "trace", point };
      const pair = pinchPair();
      return pair ? pinch(pair, pointer, point) : drag(pointer, point);
    },
    release({ pointerId }) {
      const pointer = pointers.get(pointerId);
      pointers.delete(pointerId);
      if (pointer?.isTracing) return TRACE_END;
      if (!pointer || pointer.isDragging) return NONE;
      return { kind: "target", point: pointer.start };
    },
    cancel(pointerId) {
      const pointer = pointers.get(pointerId);
      pointers.delete(pointerId);
      return pointer?.isTracing ? TRACE_END : NONE;
    },
  };
}

// `mode` est le `deltaMode` du navigateur : 0 en pixels, 1 en lignes (Firefox), 2 en pages.
export function wheelFactor(amount: number, mode: number, isTrackpadPinch: boolean): number {
  const pixels = amount * ([1, LINE_HEIGHT, PAGE_HEIGHT][mode] ?? 1);
  return Math.exp(-pixels * (isTrackpadPinch ? TRACKPAD_PINCH_SPEED : WHEEL_SPEED));
}
