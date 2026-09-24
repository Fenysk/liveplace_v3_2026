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
