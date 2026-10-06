// L'échelle des courbes (TimeCharts) : x est le créneau, y la valeur de 0 au maximum. Un créneau sans point coupe
// la courbe : le serveur était arrêté, on ne comble pas (écart §4.3, JOURNAL 2026-10-06).

export const CHART_HEIGHT = 100;
const TOP_ROOM = 4; // le pic ne touche pas le haut : la ligne de 2 px y serait coupée

type Point = { x: number; y: number };

export function chartMax(values: readonly (number | null)[]): number {
  return values.reduce<number>((max, value) => Math.max(max, value ?? 0), 1);
}

// Les suites de créneaux qui ont un point, chacune un morceau de courbe.
const toRuns = (values: readonly (number | null)[], max: number): Point[][] => {
  const runs: Point[][] = [];
  let run: Point[] = [];
  values.forEach((value, x) => {
    if (value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push({ x, y: Number((CHART_HEIGHT - (value / max) * (CHART_HEIGHT - TOP_ROOM)).toFixed(2)) });
  });
  if (run.length > 0) runs.push(run);
  return runs;
};

// `l0,0` : un point seul entre deux trous se dessine en rond, par le bout arrondi de la ligne.
export function toChartPaths(
  values: readonly (number | null)[],
  max: number,
): { line: string; area: string } {
  const runs = toRuns(values, max);
  const line = runs
    .map((run) => {
      const [first, ...rest] = run;
      if (!first) return "";
      const tail = rest.length > 0 ? rest.map(({ x, y }) => `L${x},${y}`).join("") : "l0,0";
      return `M${first.x},${first.y}${tail}`;
    })
    .join("");
  const area = runs
    .map((run) => {
      const firstX = run[0]?.x ?? 0;
      const lastX = run.at(-1)?.x ?? firstX;
      const edge = run.map(({ x, y }) => `L${x},${y}`).join("");
      return `M${firstX},${CHART_HEIGHT}${edge}L${lastX},${CHART_HEIGHT}Z`;
    })
    .join("");
  return { line, area };
}

// Le créneau qui a un point le plus proche de `index`, ou `null` s'il n'y en a aucun.
export function nearestSlot(index: number, slots: readonly unknown[]): number | null {
  const start = Math.min(Math.max(index, 0), slots.length - 1);
  for (let distance = 0; distance < slots.length; distance += 1)
    for (const candidate of [start - distance, start + distance])
      if (candidate >= 0 && candidate < slots.length && slots[candidate] !== null) return candidate;
  return null;
}

// Au clavier : le point suivant (`1`) ou précédent (`-1`) ; au bord, on reste.
export function stepSlot(index: number, direction: 1 | -1, slots: readonly unknown[]): number {
  for (let candidate = index + direction; candidate >= 0 && candidate < slots.length; candidate += direction)
    if (slots[candidate] !== null) return candidate;
  return index;
}
