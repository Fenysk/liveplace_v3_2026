import { HOUR_MS, MINUTE_MS } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { createGuardTally } from "./guard-tally";

// 12 h 00 min 20 s : le compte de la minute de midi se fait vingt secondes avant qu'elle ne se ferme.
const start = Date.UTC(2026, 10, 9, 12, 0, 20);
const noon = start - 20_000;
const DAY_MS = 24 * HOUR_MS;

const setup = () => {
  const clock = { nowMs: start };
  return { clock, tally: createGuardTally(() => clock.nowMs) };
};

describe("the tally of the guards (JOURNAL 2026-10-09)", () => {
  // Compte en mémoire les poses refusées et les connexions fermées, la minute en cours comprise, sur l'heure et sur le jour
  it("counts the refused placements and the closed connections in memory, the open minute included, over the hour and the day", () => {
    const { clock, tally } = setup();

    for (let count = 0; count < 20; count += 1) tally.countRefusedPlacement();
    tally.countClosedConnection();

    const counted = { refusedPlacements: 20, closedConnections: 1 };
    expect(tally.getTotals(clock.nowMs)).toEqual({ hour: counted, day: counted });
  });

  // Garde une minute dans l'heure pendant 60 minutes, puis dans le jour seulement, puis plus du tout après 24 heures
  it("keeps a minute in the hour for 60 minutes, then in the day only, then nowhere after 24 hours", () => {
    const { clock, tally } = setup();
    tally.countRefusedPlacement();
    const one = { refusedPlacements: 1, closedConnections: 0 };
    const zero = { refusedPlacements: 0, closedConnections: 0 };

    clock.nowMs = start + 59 * MINUTE_MS;
    expect(tally.getTotals(clock.nowMs)).toEqual({ hour: one, day: one });

    clock.nowMs = start + 60 * MINUTE_MS;
    expect(tally.getTotals(clock.nowMs)).toEqual({ hour: zero, day: one });

    clock.nowMs = noon + DAY_MS - MINUTE_MS;
    expect(tally.getTotals(clock.nowMs)).toEqual({ hour: zero, day: one });

    clock.nowMs = noon + DAY_MS;
    expect(tally.getTotals(clock.nowMs)).toEqual({ hour: zero, day: zero });
  });

  // Rend, du plus ancien au plus récent, les minutes fermées pas encore écrites, sans jamais la minute en cours
  it("lists the closed minutes not stored yet, oldest first, and never the open minute", () => {
    const { clock, tally } = setup();
    tally.countRefusedPlacement();
    tally.countRefusedPlacement();
    expect(tally.listUnstored(clock.nowMs)).toEqual([]); // la minute de midi est encore ouverte

    clock.nowMs += MINUTE_MS;
    tally.countClosedConnection();
    expect(tally.listUnstored(clock.nowMs)).toEqual([
      { at: noon, refusedPlacements: 2, closedConnections: 0 },
    ]);

    clock.nowMs += 5 * MINUTE_MS;
    expect(tally.listUnstored(clock.nowMs)).toEqual([
      { at: noon, refusedPlacements: 2, closedConnections: 0 },
      { at: noon + MINUTE_MS, refusedPlacements: 0, closedConnections: 1 },
    ]); // aucune minute vide entre les deux
  });

  // Rend une minute tant qu'elle n'est pas marquée écrite : une écriture qui échoue ne perd rien
  it("lists a minute again until it is marked stored: a write that failed loses nothing", () => {
    const { clock, tally } = setup();
    tally.countRefusedPlacement();
    clock.nowMs += MINUTE_MS;
    tally.countClosedConnection();
    clock.nowMs += MINUTE_MS;

    const [first, second] = tally.listUnstored(clock.nowMs);
    expect(tally.listUnstored(clock.nowMs)).toEqual([first, second]);

    if (first) tally.markStored([first]);
    expect(tally.listUnstored(clock.nowMs)).toEqual([second]);

    if (second) tally.markStored([second]);
    expect(tally.listUnstored(clock.nowMs)).toEqual([]);
  });

  // Reprend les minutes que Redis a gardées : elles comptent dans l'heure et le jour, ne se réécrivent pas, et celles de plus d'un jour s'en vont
  it("takes back the minutes Redis kept: they count in the hour and the day, are not written again, and those over a day old go", () => {
    const { clock, tally } = setup();

    tally.restore(
      [
        { at: noon - 30 * MINUTE_MS, refusedPlacements: 4, closedConnections: 1 },
        { at: noon - 10 * HOUR_MS, refusedPlacements: 6, closedConnections: 0 },
        { at: noon - DAY_MS - MINUTE_MS, refusedPlacements: 50, closedConnections: 50 },
      ],
      clock.nowMs,
    );
    tally.countClosedConnection();

    expect(tally.getTotals(clock.nowMs)).toEqual({
      hour: { refusedPlacements: 4, closedConnections: 2 },
      day: { refusedPlacements: 10, closedConnections: 2 },
    });
    clock.nowMs += MINUTE_MS;
    expect(tally.listUnstored(clock.nowMs)).toEqual([
      { at: noon, refusedPlacements: 0, closedConnections: 1 },
    ]);
  });
});
