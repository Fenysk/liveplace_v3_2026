// Des événements du stream en une frame `cells`, sans conflation : pour le resync et le `recent` (§4.4, §6.2).

import type { CellsFrame, Event } from "@liveplace/protocol";

export function toCellsFrame(events: readonly Event[]): CellsFrame | null {
  const last = events.at(-1);
  if (!last) return null;
  return {
    toVersion: last.version,
    cells: events.flatMap(({ version, kind, cells }) =>
      cells.map((changed) => ({ ...changed, version, kind })),
    ),
  };
}
