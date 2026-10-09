// Les durées et la courbe du mouvement, lues dans tokens.css là où JavaScript anime : jamais recopiées ici.
// Avec `prefers-reduced-motion`, tokens.css les met à 0 : l'animation n'a pas lieu.

export type MotionVariable = "--lp-dur" | "--lp-dur-fade" | "--lp-dur-fast";

const MS_PER_SECOND = 1000;

export function toMilliseconds(value: string): number {
  const duration = value.trim();
  const amount = Number.parseFloat(duration);
  if (Number.isNaN(amount)) return 0;
  return duration.endsWith("ms") ? amount : amount * MS_PER_SECOND;
}

export function motionMs(element: Element, variable: MotionVariable): number {
  return toMilliseconds(getComputedStyle(element).getPropertyValue(variable));
}

export function motionEasing(element: Element): string {
  return getComputedStyle(element).getPropertyValue("--lp-ease").trim() || "ease";
}

const CUBIC_BEZIER = /^cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;
const BISECTION_STEPS = 24;

const linear = (progress: number): number => progress;

const bezier = (t: number, first: number, second: number): number =>
  3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;

// La courbe `cubic-bezier()` du CSS pour une animation que JavaScript pilote : le temps `x` se cherche par dichotomie.
// Illisible (mot-clé, variable absente), elle devient linéaire.
export function easingCurve(css: string): (progress: number) => number {
  const points = CUBIC_BEZIER.exec(css.trim())?.slice(1).map(Number);
  const [x1, y1, x2, y2] = points ?? [];
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return linear;
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 > 1 || x2 > 1) return linear;
  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let step = 0; step < BISECTION_STEPS; step += 1) {
      const middle = (low + high) / 2;
      if (bezier(middle, x1, x2) < progress) low = middle;
      else high = middle;
    }
    return bezier((low + high) / 2, y1, y2);
  };
}
