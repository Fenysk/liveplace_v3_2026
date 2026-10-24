// Réduire une fresque rapproche ses dessins avant de couper : Écart §5.3 (JOURNAL 2026-10-24). Pur, une seule implémentation :
// redis-core applique le plan, le web l'aperçoit. Une case vide est un `colorIndex` 0 dans `state`.

import type { CanvasSize } from "./index";
import type { Pixel } from "./ports";

// Un axe du plan. `bandOf` : pour chaque ligne de l'autre axe, sa bande (-1 : rien ne bouge). `maps` : pour chaque bande, la
// nouvelle place de chaque ligne de cet axe (-1 : retirée, une ligne entièrement vide dans cette bande).
export type AxisPlan = {
  bandOf: readonly number[];
  maps: readonly (readonly number[])[];
};

// La largeur d'abord (`bandOf` : une bande par ligne de la fresque), puis la hauteur sur le résultat (`bandOf` : une bande par
// colonne du résultat). Toute case de `from` a une seule destination, ou aucune.
export type ResizePlan = {
  from: CanvasSize;
  to: CanvasSize;
  width: AxisPlan;
  height: AxisPlan;
  hasMovedPixels: boolean; // au moins un pixel posé change de case
};

const NOWHERE = -1;

const stays = (length: number): AxisPlan => ({ bandOf: Array.from({ length }, () => NOWHERE), maps: [] });

const isInPlace = (map: readonly number[]): boolean => map.every((place, line) => place === line);

type Gap = { start: number; size: number; isEdge: boolean };

// Les vides d'un axe : celui de l'origine (le bord), et ceux entre deux lignes occupées. Le bord de fin ne compte pas.
const listGaps = (occupied: readonly boolean[], first: number, last: number): Gap[] => {
  const gaps: Gap[] = first > 0 ? [{ start: 0, size: first, isEdge: true }] : [];
  for (let line = first; line < last; line++) {
    if (occupied[line] !== false) continue;
    const start = line;
    while (occupied[line] === false) line++;
    gaps.push({ start, size: line - start, isEdge: false });
  }
  return gaps;
};

// Le plus grand vide qui peut encore perdre une ligne (un vide entre deux dessins en garde une), le plus éloigné à égalité.
const biggestGap = (gaps: readonly Gap[]): Gap | undefined => {
  let biggest: Gap | undefined;
  for (const gap of gaps)
    if (gap.size >= (gap.isEdge ? 1 : 2) && (!biggest || gap.size >= biggest.size)) biggest = gap;
  return biggest;
};

// Une ligne à la fois dans le plus grand vide, par son bout le plus éloigné : les autres lignes du vide restent en place.
const dropFromGaps = (gaps: Gap[], count: number): { dropped: Set<number>; shortfall: number } => {
  const dropped = new Set<number>();
  let shortfall = count;
  for (let gap = biggestGap(gaps); shortfall > 0 && gap; gap = biggestGap(gaps)) {
    gap.size -= 1;
    dropped.add(gap.start + gap.size);
    shortfall -= 1;
  }
  return { dropped, shortfall };
};

// Les lignes d'un axe dont `occupied` dit celles qui portent un pixel : la place de chacune une fois `needed` lignes vides
// retirées, et ce qui manque si elles ne suffisent pas. D'abord le bord de fin, qui ne bouge rien (c'est la coupe d'avant), puis
// le plus grand vide. Une ligne après la dernière occupée ne bouge jamais.
function shiftLines(occupied: readonly boolean[], needed: number): { map: number[]; shortfall: number } {
  const first = occupied.indexOf(true);
  const last = occupied.lastIndexOf(true);
  if (first === -1) return { map: occupied.map((_, line) => line), shortfall: 0 };

  const trimmed = Math.min(needed, occupied.length - 1 - last);
  const { dropped, shortfall } = dropFromGaps(listGaps(occupied, first, last), needed - trimmed);
  let before = 0;
  const map = occupied.map((_, line) => {
    if (dropped.has(line)) {
      before += 1;
      return NOWHERE;
    }
    return line > last ? line : line - before;
  });
  return { map, shortfall };
}

// `crosses[cross][line]` : une case posée. Tout l'axe d'un coup, sinon une bande de croix par dessin, chacune de son côté
// (un seul niveau de bandes). Ce qui ne tient toujours pas reste sur place, et sera coupé par le cadre.
function planAxis(crosses: readonly (readonly boolean[])[], lineCount: number, needed: number): AxisPlan {
  if (needed <= 0) return stays(crosses.length);
  const unionOf = (from: number, to: number): boolean[] =>
    Array.from({ length: lineCount }, (_, line) =>
      crosses.slice(from, to).some((cross) => cross[line] === true),
    );

  const whole = shiftLines(unionOf(0, crosses.length), needed);
  if (whole.shortfall === 0)
    return isInPlace(whole.map) ? stays(crosses.length) : { bandOf: crosses.map(() => 0), maps: [whole.map] };

  const bandOf = crosses.map(() => NOWHERE);
  const maps: number[][] = [];
  for (let cross = 0; cross < crosses.length; cross++) {
    if (!crosses[cross]?.includes(true)) continue;
    const start = cross;
    while (crosses[cross]?.includes(true)) cross++;
    maps.push(shiftLines(unionOf(start, cross), needed).map);
    for (let inBand = start; inBand < cross; inBand++) bandOf[inBand] = maps.length - 1;
  }
  return maps.every(isInPlace) ? stays(crosses.length) : { bandOf, maps };
}

// Où va la case (x, y) de `from` : `null` si sa ligne ou sa colonne est retirée (elle est alors vide).
export function targetOf(plan: ResizePlan, x: number, y: number): { x: number; y: number } | null {
  const widthBand = plan.width.bandOf[y] ?? NOWHERE;
  const movedX = widthBand < 0 ? x : (plan.width.maps[widthBand]?.[x] ?? NOWHERE);
  if (movedX < 0) return null;
  const heightBand = plan.height.bandOf[movedX] ?? NOWHERE;
  const movedY = heightBand < 0 ? y : (plan.height.maps[heightBand]?.[y] ?? NOWHERE);
  return movedY < 0 ? null : { x: movedX, y: movedY };
}

const isPlacedAt = (state: Uint8Array, width: number, x: number, y: number): boolean =>
  state[y * width + x] !== 0;

// Le résultat de la largeur, colonne par colonne : la hauteur se rapproche sur ce qu'on y voit, coupe comprise.
const columnsAfterWidth = (state: Uint8Array, plan: ResizePlan): boolean[][] => {
  const { from } = plan;
  const columns = Array.from({ length: from.width }, () => new Array<boolean>(from.height).fill(false));
  for (let y = 0; y < from.height; y++)
    for (let x = 0; x < from.width; x++) {
      const moved = isPlacedAt(state, from.width, x, y) ? targetOf(plan, x, y) : null;
      const column = moved ? columns[moved.x] : undefined;
      if (column) column[y] = true;
    }
  return columns;
};

const hasMovedPixel = (state: Uint8Array, plan: ResizePlan): boolean => {
  for (let y = 0; y < plan.from.height; y++)
    for (let x = 0; x < plan.from.width; x++) {
      if (!isPlacedAt(state, plan.from.width, x, y)) continue;
      const target = targetOf(plan, x, y);
      if (target?.x !== x || target.y !== y) return true;
    }
  return false;
};

// `state` : un octet par case de `from`, 0 pour une case vide (D-15 : `stateOffset`).
export function planResize(state: Uint8Array, from: CanvasSize, to: CanvasSize): ResizePlan {
  if (state.length !== from.width * from.height)
    throw new Error(`planResize : ${state.length} octets pour une fresque de ${from.width}×${from.height}`);
  const rows = Array.from({ length: from.height }, (_, y) =>
    Array.from({ length: from.width }, (_, x) => isPlacedAt(state, from.width, x, y)),
  );
  const width = planAxis(rows, from.width, from.width - to.width);
  const widthOnly: ResizePlan = { from, to, width, height: stays(from.width), hasMovedPixels: false };
  const height = planAxis(columnsAfterWidth(state, widthOnly), from.height, from.height - to.height);
  const plan: ResizePlan = { from, to, width, height, hasMovedPixels: false };
  return { ...plan, hasMovedPixels: hasMovedPixel(state, plan) };
}

// Les pixels posés que le plan laisse hors du cadre `to`, à leur place d'aujourd'hui : gardés, invisibles.
export function listCutPixels(plan: ResizePlan, state: Uint8Array): Pixel[] {
  const cut: Pixel[] = [];
  for (let y = 0; y < plan.from.height; y++)
    for (let x = 0; x < plan.from.width; x++) {
      const colorIndex = state[y * plan.from.width + x] ?? 0;
      const target = colorIndex === 0 ? null : targetOf(plan, x, y);
      if (target && (target.x >= plan.to.width || target.y >= plan.to.height)) cut.push({ x, y, colorIndex });
    }
  return cut;
}
