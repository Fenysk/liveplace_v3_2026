import type { Event, EventCell } from "@liveplace/protocol";
import { describe, expect, it } from "vitest";
import { conflate } from "./conflate";

const occurredAt = 1_700_000_000_000;

const cell = (x: number, y: number, colorIndex: number, overrides: Partial<EventCell> = {}): EventCell => ({
  x,
  y,
  colorIndex,
  previousColorIndex: 0,
  placedAt: occurredAt,
  ...overrides,
});

const event = (version: number, cells: EventCell[], kind: Event["kind"] = "place"): Event => ({
  version,
  kind,
  authorId: "user-1",
  occurredAt,
  cells,
});

describe("conflate (§6.2)", () => {
  // N'envoie rien quand le tampon du tick est vide
  it("sends nothing when the tick buffer is empty", () => {
    expect(conflate([])).toBeNull();
  });

  // Garde chaque case d'un événement, avec la version et le kind de celui-ci
  it("keeps every cell of one event, each carrying its version and kind", () => {
    expect(conflate([event(7, [cell(0, 0, 1), cell(1, 0, 2)])])).toEqual({
      toVersion: 7,
      cells: [
        { x: 0, y: 0, colorIndex: 1, previousColorIndex: 0, placedAt: occurredAt, version: 7, kind: "place" },
        { x: 1, y: 0, colorIndex: 2, previousColorIndex: 0, placedAt: occurredAt, version: 7, kind: "place" },
      ],
    });
  });

  // Fusionne deux poses sur la même case : couleur et date de la dernière, previousColorIndex de la première
  it("conflates two placements on one cell: last color and date, first previousColorIndex", () => {
    const first = event(1, [cell(3, 2, 5, { previousColorIndex: 1 })]);
    const second = event(2, [cell(3, 2, 6, { previousColorIndex: 5, placedAt: occurredAt + 10 })]);

    expect(conflate([first, second])).toEqual({
      toVersion: 2,
      cells: [
        {
          x: 3,
          y: 2,
          colorIndex: 6,
          previousColorIndex: 1,
          placedAt: occurredAt + 10,
          version: 2,
          kind: "place",
        },
      ],
    });
  });

  // Ne fusionne jamais deux cases différentes
  it("never conflates two different cells", () => {
    const frame = conflate([event(1, [cell(3, 2, 5)]), event(2, [cell(2, 3, 6)])]);

    expect(frame?.cells).toHaveLength(2);
  });

  // Ne fusionne jamais à travers kind : une suppression coupe la fusion sur cette case
  it("never conflates across kinds", () => {
    const placed = event(1, [cell(3, 2, 5)]);
    const cleared = event(2, [cell(3, 2, 0, { previousColorIndex: 5 })], "clear");

    expect(conflate([placed, cleared])?.cells).toEqual([
      { x: 3, y: 2, colorIndex: 5, previousColorIndex: 0, placedAt: occurredAt, version: 1, kind: "place" },
      { x: 3, y: 2, colorIndex: 0, previousColorIndex: 5, placedAt: occurredAt, version: 2, kind: "clear" },
    ]);
  });

  // Ordonne les cases par version croissante, même quand l'une d'elles a été fusionnée
  it("orders cells by ascending version, even when one of them was conflated", () => {
    const frame = conflate([
      event(1, [cell(3, 2, 5)]),
      event(2, [cell(2, 3, 6)]),
      event(3, [cell(3, 2, 7, { previousColorIndex: 5 })]),
    ]);

    expect(frame?.cells.map((changed) => changed.version)).toEqual([2, 3]);
  });

  // Avance toVersion sur un événement sans case, pour que le client ne croie pas avoir manqué une version
  it("moves toVersion forward on an event without cells", () => {
    expect(conflate([event(4, [])])).toEqual({ toVersion: 4, cells: [] });
  });
});
