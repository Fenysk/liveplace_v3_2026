import { describe, expect, it, vi } from "vitest";
import type { Gesture } from "./gestures";
import { createNavigationWatch, PAN_MIN_DISTANCE } from "./navigation-watch";

const pan = (dx: number, dy = 0): Gesture => ({ kind: "pan", dx, dy });
const pinch = (factor: number): Gesture => ({
  kind: "pinch",
  dx: 0,
  dy: 0,
  point: { x: 100, y: 100 },
  factor,
});

const setup = () => {
  const onNavigate = vi.fn();
  return { onNavigate, navigation: createNavigationWatch(onNavigate) };
};

describe("ce que l'utilisateur fait de la vue (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Un glissement trop court n'est pas un déplacement : un doigt qui dérive ne remplit pas un point
  it("does not count a drag shorter than the minimum as a move", () => {
    const { navigation, onNavigate } = setup();

    navigation.watch(pan(20, 10));
    navigation.end();

    expect(onNavigate).not.toHaveBeenCalled();
  });

  // Un glissement qui cumule le minimum est un déplacement, rapporté une fois, quand le doigt se lève
  it("counts a drag that adds up to the minimum as one move, reported once the finger lifts", () => {
    const { navigation, onNavigate } = setup();

    navigation.watch(pan(PAN_MIN_DISTANCE / 2, 0));
    navigation.watch(pan(0, PAN_MIN_DISTANCE / 2));
    expect(onNavigate).not.toHaveBeenCalled();
    navigation.end();

    expect(onNavigate.mock.calls).toEqual([["pan"]]);
  });

  // Deux glissements courts séparés ne s'additionnent pas : chaque doigt levé repart de zéro
  it("starts from zero at each finger lifted: two short drags never add up", () => {
    const { navigation, onNavigate } = setup();

    navigation.watch(pan(30));
    navigation.end();
    navigation.watch(pan(30));
    navigation.end();

    expect(onNavigate).not.toHaveBeenCalled();
  });

  // Un pincement léger n'est pas un zoom, un pincement franc l'est, dans un sens comme dans l'autre
  it("counts a pinch only past the minimum ratio, in either direction", () => {
    const light = setup();
    light.navigation.watch(pinch(1.1));
    light.navigation.watch(pinch(0.95));
    light.navigation.end();
    expect(light.onNavigate).not.toHaveBeenCalled();

    const spread = setup();
    spread.navigation.watch(pinch(1.15));
    spread.navigation.watch(pinch(1.15));
    spread.navigation.end();
    expect(spread.onNavigate.mock.calls).toEqual([["zoom"]]);

    const squeezed = setup();
    squeezed.navigation.watch(pinch(0.8));
    squeezed.navigation.watch(pinch(0.8));
    squeezed.navigation.end();
    expect(squeezed.onNavigate.mock.calls).toEqual([["zoom"]]);
  });

  // La molette et les boutons Zoomer n'ont pas de doigt à lever : un zoom, tout de suite
  it("counts a wheel or button zoom at once", () => {
    const { navigation, onNavigate } = setup();

    navigation.watch({ kind: "zoom", point: { x: 0, y: 0 }, factor: 1.5 });

    expect(onNavigate.mock.calls).toEqual([["zoom"]]);
  });

  // Une visée ou un tracé ne déplacent pas la vue
  it("ignores aiming and tracing gestures", () => {
    const { navigation, onNavigate } = setup();

    navigation.watch({ kind: "target", point: { x: 5, y: 5 } });
    navigation.watch({ kind: "trace", point: { x: 90, y: 90 } });
    navigation.watch({ kind: "traceEnd" });
    navigation.end();

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
