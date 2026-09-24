// Les teintes du canvas, lues dans les variables de tokens.css : la même source que les pills (JOURNAL 2026-09-24).
// Relues quand `data-theme` change : le canvas suit le thème comme le reste.

import type { SceneShades } from "./render-scene";

export function getSceneShades(root: Element): SceneShades {
  const style = getComputedStyle(root);
  const variable = (name: string) => style.getPropertyValue(name).trim();
  return {
    void: variable("--void"),
    voidDot: variable("--void-dot"),
    border: variable("--canvas-border"),
    grid: variable("--canvas-grid"),
    checkerA: variable("--checker-a"),
    checkerB: variable("--checker-b"),
    outlineIn: variable("--draft-outline-in"),
    outlineOut: variable("--draft-outline-out"),
  };
}
