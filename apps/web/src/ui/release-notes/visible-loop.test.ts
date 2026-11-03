import { describe, expect, it } from "vitest";
import { type LoopEnvironment, startVisibleLoop } from "./visible-loop";

// Un environnement à la main : on dit quand l'élément paraît, et quand une image passe.
const fakeEnvironment = () => {
  let onVisible: ((isVisible: boolean) => void) | undefined;
  let pending: ((timeMs: number) => void) | undefined;
  let handles = 0;
  const calls = { observed: 0, disconnected: 0, cancelled: 0 };
  const environment: LoopEnvironment = {
    observe(_element, change) {
      calls.observed++;
      onVisible = change;
      return () => {
        calls.disconnected++;
      };
    },
    schedule(callback) {
      pending = callback;
      return ++handles;
    },
    cancel() {
      calls.cancelled++;
      pending = undefined;
    },
  };
  return {
    environment,
    calls,
    show: (isVisible: boolean) => onVisible?.(isVisible),
    frame: (timeMs: number) => {
      const callback = pending;
      pending = undefined;
      callback?.(timeMs);
    },
    hasPendingFrame: () => pending !== undefined,
  };
};

const element = {} as Element;

describe("la boucle qui ne tourne qu'à l'écran", () => {
  // Tant que l'élément n'est pas à l'écran, aucune image n'est demandée
  it("asks for no frame while the element is not on screen", () => {
    const fake = fakeEnvironment();
    startVisibleLoop(element, () => undefined, fake.environment);

    expect(fake.calls.observed).toBe(1);
    expect(fake.hasPendingFrame()).toBe(false);
  });

  // Quand l'élément paraît, chaque image se peint avec son temps, et la suivante est demandée
  it("paints each frame with its time and asks for the next one once on screen", () => {
    const fake = fakeEnvironment();
    const times: number[] = [];
    startVisibleLoop(element, (timeMs) => times.push(timeMs), fake.environment);

    fake.show(true);
    fake.frame(16);
    fake.frame(33);

    expect(times).toEqual([16, 33]);
    expect(fake.hasPendingFrame()).toBe(true);
  });

  // Quand l'élément sort de l'écran, la boucle s'arrête ; quand il revient, elle repart
  it("stops when the element leaves the screen and starts again when it comes back", () => {
    const fake = fakeEnvironment();
    const times: number[] = [];
    startVisibleLoop(element, (timeMs) => times.push(timeMs), fake.environment);

    fake.show(true);
    fake.frame(16);
    fake.show(false);
    expect(fake.hasPendingFrame()).toBe(false);
    fake.frame(33);
    expect(times).toEqual([16]);

    fake.show(true);
    fake.frame(50);
    expect(times).toEqual([16, 50]);
  });

  // Au démontage, l'écoute est retirée et l'image en attente annulée : rien ne tourne plus
  it("cancels the pending frame and stops listening when it is stopped", () => {
    const fake = fakeEnvironment();
    const stop = startVisibleLoop(element, () => undefined, fake.environment);

    fake.show(true);
    stop();

    expect(fake.calls.disconnected).toBe(1);
    expect(fake.calls.cancelled).toBeGreaterThanOrEqual(1);
    expect(fake.hasPendingFrame()).toBe(false);
  });
});
