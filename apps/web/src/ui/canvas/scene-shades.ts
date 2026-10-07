// Les teintes du canvas, lues dans les variables de tokens.css : la même source que les pills (JOURNAL 2026-09-24).
// Relues quand `data-appearance` change : le canvas suit l'apparence comme le reste.

import type { SceneShades } from "./render-scene";

export function getSceneShades(root: Element): SceneShades {
  const style = getComputedStyle(root);
  const variable = (name: string) => style.getPropertyValue(name).trim();
  return {
    void: variable("--void"),
    border: variable("--canvas-border"),
    grid: variable("--canvas-grid"),
    outlineIn: variable("--draft-outline-in"),
    outlineOut: variable("--draft-outline-out"),
  };
}
