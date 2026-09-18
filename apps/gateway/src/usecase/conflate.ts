// Le tick de diffusion (§6.2) : un lot d'événements devient une seule frame `cells`.

import { toCellKey } from "@liveplace/domain";
import type { BroadcastCell, CellsFrame, Event } from "@liveplace/protocol";

export function conflate(events: readonly Event[]): CellsFrame | null {
  if (events.length === 0) return null;

  const cells: BroadcastCell[] = [];
  // La case ouverte est la dernière entrée de cette case : elle seule peut encore fusionner.
  const openIndexByCell = new Map<number, number>();
  let toVersion = 0;

  for (const event of events) {
    toVersion = Math.max(toVersion, event.version);
    for (const changed of event.cells) {
      const openIndex = openIndexByCell.get(toCellKey(changed.x, changed.y));
      const open = openIndex === undefined ? undefined : cells[openIndex];
      if (open !== undefined && openIndex !== undefined && open.kind === event.kind) {
        // Deux champs du dernier, `previousColorIndex` du premier : c'est la couleur d'avant la fusion entière.
        cells[openIndex] = {
          ...open,
          colorIndex: changed.colorIndex,
          placedAt: changed.placedAt,
          version: event.version,
        };
        continue;
      }
      openIndexByCell.set(toCellKey(changed.x, changed.y), cells.length);
      cells.push({ ...changed, version: event.version, kind: event.kind });
    }
  }

  // Une case fusionnée porte la version de sa dernière pose : sans ce tri, elle resterait au rang de la première.
  cells.sort((left, right) => left.version - right.version);
  return { toVersion, cells };
}
