// Le trajet de la souris des vignettes : où se pose sa pointe, `ax`, `ay` en unités de la vignette et `bx`, `by` en unités de la pill
// (une pill est ancrée à un bord, et ses boutons ne bougent pas : leur place est un écart par rapport à ce point d'ancrage).
// Un trajet est une suite de points de passage datés : la souris va de l'un à l'autre en glissant, et attend quand deux se suivent
// au même endroit.

import { clamp, ease, lerp, spanIn } from "./motion-math";

export type PointerSpot = { ax: number; ay: number; bx: number; by: number };
export type PointerMoment = PointerSpot & { opacity: number };

export const mixSpots = (from: PointerSpot, to: PointerSpot, progress: number): PointerSpot => ({
  ax: lerp(from.ax, to.ax, progress),
  ay: lerp(from.ay, to.ay, progress),
  bx: lerp(from.bx, to.bx, progress),
  by: lerp(from.by, to.by, progress),
});

// Un tronçon : chacun dit où est la souris selon la part du tronçon déjà faite.
export type Leg = { fromMs: number; untilMs: number; spotAt: (progress: number) => PointerSpot };

// Où est la souris à l'instant `t` : le premier tronçon qui n'est pas fini, et sinon le dernier.
export const spotAmong = (legs: readonly Leg[], t: number, fallback: PointerSpot): PointerSpot => {
  const leg = legs.find(({ untilMs }) => t < untilMs) ?? legs.at(-1);
  return leg ? leg.spotAt(clamp((t - leg.fromMs) / (leg.untilMs - leg.fromMs))) : fallback;
};

// Un point de passage : la souris y est à `atMs`.
export type Waypoint = { atMs: number; spot: PointerSpot };

// La souris attend au premier point, glisse de l'un à l'autre en s'adoucissant, et reste au dernier.
export const spotAlong = (waypoints: readonly Waypoint[], t: number): PointerSpot => {
  const first = waypoints[0];
  const last = waypoints.at(-1);
  if (!first || !last) return { ax: 0, ay: 0, bx: 0, by: 0 };
  if (t <= first.atMs) return first.spot;
  if (t >= last.atMs) return last.spot;
  const nextIndex = waypoints.findIndex(({ atMs }) => atMs > t);
  const from = waypoints[nextIndex - 1] ?? first;
  const to = waypoints[nextIndex] ?? last;
  return mixSpots(from.spot, to.spot, ease((t - from.atMs) / (to.atMs - from.atMs)));
};

// La souris paraît en fondu avant son premier trajet, et part en fondu quand tout s'efface : `keep` va de 1 à 0.
export const pointerOpacity = (t: number, appearsFromMs: number, appearsToMs: number, keep: number): number =>
  spanIn(t, appearsFromMs, appearsToMs) * keep;
