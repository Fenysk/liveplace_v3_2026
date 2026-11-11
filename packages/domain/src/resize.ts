// Réduire une fresque rapproche ses dessins avant de couper : §5.8. Pur, une seule implémentation :
// redis-core applique le plan, le web l'aperçoit. Une case vide est un `colorIndex` 0 dans `state`.

import type { CanvasSize } from "./index";
import type { Pixel } from "./ports";

// Un axe du plan. `bandOf` : pour chaque ligne de l'autre axe, sa bande (-1 : rien ne bouge). `maps` : pour chaque bande, la
// nouvelle place de chaque ligne de cet axe (-1 : retirée, une ligne entièrement vide dans cette bande).
export type AxisPlan = {
  bandOf: readonly number[];
  maps: readonly (readonly number[])[];
};

// La largeur d'abord (`bandOf` : une bande par ligne de l'étendue), puis la hauteur sur le résultat (`bandOf` : une bande par
// colonne du résultat). Toute case de l'étendue a une seule destination, ou aucune. `extent` : `from` étendu aux pixels hors du
// cadre (JOURNAL 2026-11-05) ; sans eux, c'est `from`.
export type ResizePlan = {
  from: CanvasSize;
  extent: CanvasSize;
  to: CanvasSize;
  width: AxisPlan;
  height: AxisPlan;
  hasMovedPixels: boolean; // au moins un pixel posé change de case
};

const NOWHERE = -1;

const stays = (length: number): AxisPlan => ({ bandOf: Array.from({ length }, () => NOWHERE), maps: [] });

const isInPlace = (map: readonly number[]): boolean => map.every((place, line) => place === line);

type Gap = { start: number; size: number; isEdge: boolean };

// Les vides d'un axe : celui de l'origine (le bord), et ceux entre deux lignes occupées du cadre. Le bord de fin ne compte pas, ni
// rien de ce qui est hors du cadre (`frameLength` lignes).
const listGaps = (occupied: readonly boolean[], first: number, last: number, frameLength: number): Gap[] => {
  const gaps: Gap[] = first > 0 ? [{ start: 0, size: Math.min(first, frameLength), isEdge: true }] : [];
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

// Les lignes d'un axe dont `occupied` dit celles qui portent un pixel (cadre de `frameLength` lignes, et au-delà l'étendue) : la
// place de chacune une fois `needed` lignes vides du cadre retirées, et ce qui manque si elles ne suffisent pas. D'abord le bord de
// fin du cadre, qui ne bouge rien (c'est la coupe d'avant), puis le plus grand vide. Toute ligne gardée recule du nombre de lignes
// retirées avant elle, donc un pixel hors du cadre recule d'au plus `needed` et n'y revient jamais.
function shiftLines(
  occupied: readonly boolean[],
  needed: number,
  frameLength: number,
): { map: number[]; shortfall: number } {
  const first = occupied.indexOf(true);
  if (first === -1) return { map: occupied.map((_, line) => line), shortfall: 0 };

  const last = occupied.lastIndexOf(true, frameLength - 1);
  const trimmed = Math.min(needed, frameLength - 1 - last);
  const { dropped, shortfall } = dropFromGaps(listGaps(occupied, first, last, frameLength), needed - trimmed);
  let before = 0;
  const map = occupied.map((_, line) => {
    if (dropped.has(line)) {
      before += 1;
      return NOWHERE;
    }
    return line - before;
  });
  return { map, shortfall };
}

// `crosses[cross][line]` : une case posée. Tout l'axe d'un coup, sinon une bande de croix par dessin, chacune de son côté
// (un seul niveau de bandes). Ce qui ne tient toujours pas reste sur place, et sera coupé par le cadre.
function planAxis(
  crosses: readonly (readonly boolean[])[],
  lineCount: number,
  needed: number,
  frameLength: number,
): AxisPlan {
  if (needed <= 0) return stays(crosses.length);
  const unionOf = (from: number, to: number): boolean[] =>
    Array.from({ length: lineCount }, (_, line) =>
      crosses.slice(from, to).some((cross) => cross[line] === true),
    );

  const whole = shiftLines(unionOf(0, crosses.length), needed, frameLength);
  if (whole.shortfall === 0)
    return isInPlace(whole.map) ? stays(crosses.length) : { bandOf: crosses.map(() => 0), maps: [whole.map] };

  const bandOf = crosses.map(() => NOWHERE);
  const maps: number[][] = [];
  for (let cross = 0; cross < crosses.length; cross++) {
    if (!crosses[cross]?.includes(true)) continue;
    const start = cross;
    while (crosses[cross]?.includes(true)) cross++;
    maps.push(shiftLines(unionOf(start, cross), needed, frameLength).map);
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
const columnsAfterWidth = (rows: readonly (readonly boolean[])[], plan: ResizePlan): boolean[][] => {
  const { extent } = plan;
  const columns = Array.from({ length: extent.width }, () => new Array<boolean>(extent.height).fill(false));
  for (let y = 0; y < extent.height; y++)
    for (let x = 0; x < extent.width; x++) {
      const moved = rows[y]?.[x] ? targetOf(plan, x, y) : null;
      const column = moved ? columns[moved.x] : undefined;
      if (column) column[y] = true;
    }
  return columns;
};

// L'étendue : le cadre, et la boîte des pixels qui en sont sortis.
const extentOf = (from: CanvasSize, cut: readonly Pixel[]): CanvasSize => {
  let [width, height] = [from.width, from.height];
  for (const { x, y } of cut) [width, height] = [Math.max(width, x + 1), Math.max(height, y + 1)];
  return { width, height };
};

// Une case posée par ligne de l'étendue : celles de `state`, puis les pixels hors du cadre.
const occupancyOf = (state: Uint8Array, from: CanvasSize, extent: CanvasSize, cut: readonly Pixel[]) => {
  const rows = Array.from({ length: extent.height }, (_, y) =>
    Array.from(
      { length: extent.width },
      (_, x) => x < from.width && y < from.height && isPlacedAt(state, from.width, x, y),
    ),
  );
  for (const { x, y } of cut) {
    const row = rows[y];
    if (row) row[x] = true;
  }
  return rows;
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

// `state` : un octet par case de `from`, 0 pour une case vide (D-15 : `stateOffset`). `cut` : les pixels hors du cadre (têtes de pile
// colorées, x ≥ from.width ou y ≥ from.height) : ils se rapprochent avec leur dessin et ne reviennent dans le cadre qu'à un agrandissement.
export function planResize(
  state: Uint8Array,
  from: CanvasSize,
  to: CanvasSize,
  cut: readonly Pixel[] = [],
): ResizePlan {
  if (state.length !== from.width * from.height)
    throw new Error(`planResize : ${state.length} octets pour une fresque de ${from.width}×${from.height}`);
  if (cut.some(({ x, y }) => x < from.width && y < from.height))
    throw new Error(`planResize : un pixel hors du cadre est dans le cadre de ${from.width}×${from.height}`);
  const placed = cut.filter(({ colorIndex }) => colorIndex !== 0);
  const extent = extentOf(from, placed);
  const rows = occupancyOf(state, from, extent, placed);
  const width = planAxis(rows, extent.width, from.width - to.width, from.width);
  const widthOnly: ResizePlan = {
    from,
    extent,
    to,
    width,
    height: stays(extent.width),
    hasMovedPixels: false,
  };
  const height = planAxis(
    columnsAfterWidth(rows, widthOnly),
    extent.height,
    from.height - to.height,
    from.height,
  );
  const plan: ResizePlan = { from, extent, to, width, height, hasMovedPixels: false };
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
