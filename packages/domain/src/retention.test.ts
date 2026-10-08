import { describe, expect, it } from "vitest";
import { HOUR_MS } from "./index";
import {
  DAILY_FULL_MS,
  DAILY_KEPT_MS,
  DAY_MS,
  HISTORY_BUDGET_OTHER_BYTES,
  HISTORY_BUDGET_PROD_BYTES,
  HISTORY_FLOOR_MS,
  HOURLY_KEPT_MS,
  historyBudgetBytes,
  planRetention,
  purgeableRanges,
  type RetentionAction,
  type TierRow,
  WEEK_MS,
} from "./retention";

// Un lundi à 00:00 UTC, 1er jour d'une semaine : le début des semaines de la pyramide (1970-01-05 est un lundi).
const MONDAY = Date.UTC(2026, 9, 5);
const row = (tier: TierRow["tier"], takenAt: number, version = takenAt, isStateOnly = false): TierRow => ({
  tier,
  version,
  takenAt,
  isStateOnly,
});

// Applique les actions comme le worker : une promotion ajoute une ligne qui partage la version, une dégradation passe la
// ligne en `state` seul, un retrait l'enlève. Le plan suivant doit n'avoir plus rien à faire.
const apply = (rows: readonly TierRow[], actions: readonly RetentionAction[]): TierRow[] => {
  let next = [...rows];
  for (const action of actions) {
    if (action.kind === "promote")
      next.push({ ...action.from, tier: action.to, isStateOnly: action.isStateOnly });
    if (action.kind === "degrade")
      next = next.map((candidate) =>
        candidate.tier === action.row.tier && candidate.takenAt === action.row.takenAt
          ? { ...candidate, isStateOnly: true }
          : candidate,
      );
    if (action.kind === "discard")
      next = next.filter((c) => !(c.tier === action.row.tier && c.takenAt === action.row.takenAt));
  }
  return next;
};

describe("the hourly tier (JOURNAL 2026-10-08)", () => {
  // Quand une sauvegarde de travail arrive dans une heure sans palier horaire, elle y est promue, et une seule par heure
  it("promotes a working snapshot into an hour without an hourly one, one per hour", () => {
    const now = MONDAY + 10 * HOUR_MS + 30 * 60_000;
    const first = row("working", MONDAY + 10 * HOUR_MS + 5 * 60_000);
    const second = row("working", MONDAY + 10 * HOUR_MS + 25 * 60_000);

    expect(planRetention([first], now)).toEqual([
      { kind: "promote", from: first, to: "hourly", isStateOnly: false },
    ]);
    expect(planRetention([first, row("hourly", first.takenAt)], now)).toEqual([]);
    expect(planRetention([first, second, row("hourly", first.takenAt)], now)).toEqual([]);
  });

  // L'heure suivante, la nouvelle sauvegarde de travail est promue à son tour
  it("promotes again in the next hour", () => {
    const earlier = row("working", MONDAY + 10 * HOUR_MS);
    const next = row("working", MONDAY + 11 * HOUR_MS + 2 * 60_000);

    expect(planRetention([earlier, next, row("hourly", earlier.takenAt)], next.takenAt + 60_000)).toEqual([
      { kind: "promote", from: next, to: "hourly", isStateOnly: false },
    ]);
  });

  // Un canvas calme n'a pas de nouvelle ligne à chaque heure : sa sauvegarde garde l'heure où elle a été prise
  it("adds no row for a calm canvas as hours go by", () => {
    const only = row("working", MONDAY + 10 * HOUR_MS);
    const rows = apply([only], planRetention([only], only.takenAt + 60_000));

    expect(planRetention(rows, only.takenAt + 5 * HOUR_MS)).toEqual([]);
  });

  // Une sauvegarde de plus de 24 h ne devient pas un palier horaire qui s'effacerait aussitôt
  it("does not promote a working snapshot older than a day", () => {
    const idle = row("working", MONDAY);

    const hourly = planRetention([idle], MONDAY + HOURLY_KEPT_MS + 1).filter(
      (action) => action.kind === "promote" && action.to === "hourly",
    );

    expect(hourly).toEqual([]);
  });

  // Les paliers horaires de plus de 24 h partent, ceux d'hier soir restent
  it("discards hourly rows older than a day and keeps the others", () => {
    const now = MONDAY + 3 * DAY_MS;
    const gone = row("hourly", now - HOURLY_KEPT_MS);
    const kept = row("hourly", now - HOURLY_KEPT_MS + 1);

    const actions = planRetention([gone, kept], now);

    expect(actions.filter(({ kind }) => kind === "discard")).toEqual([{ kind: "discard", row: gone }]);
  });
});

describe("the daily tier", () => {
  // Une journée se promeut quand elle est finie, depuis la plus récente sauvegarde de sa journée
  it("promotes a day once it is over, from the newest save of that day", () => {
    const day = MONDAY + DAY_MS;
    const early = row("hourly", day + 2 * HOUR_MS);
    const late = row("hourly", day + 22 * HOUR_MS);

    expect(planRetention([early, late], day + 20 * HOUR_MS)).toEqual([]);
    expect(planRetention([early, late], day + DAY_MS + 60_000)).toEqual([
      { kind: "promote", from: late, to: "daily", isStateOnly: false },
    ]);
  });

  // Une journée qui a déjà son palier quotidien n'est pas promue une deuxième fois
  it("promotes a day only once", () => {
    const day = MONDAY + DAY_MS;
    const late = row("hourly", day + 22 * HOUR_MS);

    expect(planRetention([late, row("daily", late.takenAt)], day + DAY_MS + 60_000)).toEqual([]);
  });

  // Une journée de plus de 30 jours ne se promeut plus, elle partirait aussitôt
  it("does not promote a day older than thirty days", () => {
    const day = MONDAY + DAY_MS;
    const late = row("hourly", day + 22 * HOUR_MS);

    const dailies = planRetention([late], day + DAILY_KEPT_MS + DAY_MS).filter(
      (action) => action.kind === "promote" && action.to === "daily",
    );

    expect(dailies).toEqual([]);
  });

  // Un jour fini depuis plus de 7 jours entre déjà en `state` seul : le plan suivant n'a pas à le dégrader aussitôt
  it("promotes a day older than seven days straight into state only, so the next plan has nothing to degrade", () => {
    const day = MONDAY + DAY_MS;
    const late = row("hourly", day + 22 * HOUR_MS);
    const now = day + DAILY_FULL_MS + 2 * DAY_MS;

    const [promotion] = planRetention([late], now);
    const once = apply([late], planRetention([late], now));

    expect(promotion).toEqual({ kind: "promote", from: late, to: "daily", isStateOnly: true });
    expect(planRetention(once, now).filter(({ kind }) => kind === "degrade")).toEqual([]);
  });

  // Après 7 jours, le palier quotidien complet passe en `state` seul : le dessin reste, ses auteurs non
  it("degrades a full daily row to state only after seven days, never one that already is", () => {
    const at = MONDAY;
    const full = row("daily", at);
    const small = row("daily", at + DAY_MS, 7, true);

    const degrades = (now: number) =>
      planRetention([full, small], now).filter(({ kind }) => kind === "degrade");

    expect(degrades(at + DAILY_FULL_MS - 1)).toEqual([]);
    expect(degrades(at + DAILY_FULL_MS + DAY_MS + 1)).toEqual([{ kind: "degrade", row: full }]);
  });

  // Après 30 jours, il part, complet ou non
  it("discards a daily row after thirty days, whether it is full or state only", () => {
    const full = row("daily", MONDAY);
    const small = row("daily", MONDAY + DAY_MS, 7, true);
    const now = MONDAY + DAY_MS + DAILY_KEPT_MS;

    const discards = planRetention([full, small], now).filter(({ kind }) => kind === "discard");

    expect(discards).toEqual([
      { kind: "discard", row: full },
      { kind: "discard", row: small },
    ]);
  });
});

describe("the weekly tier", () => {
  // Une semaine se promeut quand elle est finie, en `state` seul, depuis la plus récente sauvegarde de sa semaine
  it("promotes a week once it is over, from the newest save of that week", () => {
    const earlyDay = row("daily", MONDAY + DAY_MS);
    const lastDay = row("daily", MONDAY + 5 * DAY_MS);

    expect(planRetention([earlyDay, lastDay], MONDAY + 6 * DAY_MS)).toEqual([]);
    expect(planRetention([earlyDay, lastDay], MONDAY + WEEK_MS + 60_000)).toEqual([
      { kind: "promote", from: lastDay, to: "weekly", isStateOnly: true },
    ]);
  });

  // La source déjà en `state` seul est partagée telle quelle : l'action le dit par la ligne source
  it("takes a state-only source as it is, and says it through the source row", () => {
    const small = row("daily", MONDAY + 5 * DAY_MS, 9, true);

    const [action] = planRetention([small], MONDAY + WEEK_MS + 60_000);

    expect(action).toEqual({ kind: "promote", from: small, to: "weekly", isStateOnly: true });
  });

  // Une semaine manquée (le worker était arrêté) se rattrape tant qu'une sauvegarde de cette semaine existe
  it("catches up a missed week as long as a save of that week exists", () => {
    const missed = row("daily", MONDAY + 2 * DAY_MS);
    const current = row("daily", MONDAY + 3 * WEEK_MS + DAY_MS);

    const actions = planRetention([missed, current], MONDAY + 4 * WEEK_MS);

    expect(
      actions
        .filter(({ kind }) => kind === "promote")
        .map((action) => action.kind === "promote" && action.from),
    ).toEqual([missed, current]);
  });

  // Un palier hebdomadaire ne part jamais, quel que soit son âge
  it("never discards a weekly row, however old", () => {
    const weekly = row("weekly", MONDAY, 3, true);

    expect(planRetention([weekly], MONDAY + 500 * DAY_MS)).toEqual([]);
  });
});

describe("the pyramid as a whole", () => {
  // Les promotions passent avant les dégradations, qui passent avant les retraits : la source d'une promotion est encore là
  it("orders promotions before degradations before discards", () => {
    const now = MONDAY + 40 * DAY_MS;
    const rows = [
      row("hourly", now - HOURLY_KEPT_MS - HOUR_MS),
      row("daily", now - DAILY_FULL_MS - DAY_MS),
      row("daily", now - DAILY_KEPT_MS - DAY_MS),
      row("working", now - 5 * 60_000),
    ];

    const kinds = planRetention(rows, now).map(({ kind }) => kind);

    expect(kinds).toEqual(
      [...kinds].sort(
        (a, b) => ["promote", "degrade", "discard"].indexOf(a) - ["promote", "degrade", "discard"].indexOf(b),
      ),
    );
    expect(new Set(kinds)).toEqual(new Set(["promote", "degrade", "discard"]));
  });

  // Appliquer les actions puis replanifier ne donne plus rien : la boucle du worker se rejoue sans dégât, après un arrêt aussi
  it("has nothing left to do once its actions are applied, so it can be replayed", () => {
    const rows: TierRow[] = [
      row("working", MONDAY + 29 * DAY_MS + 2 * HOUR_MS),
      row("working", MONDAY + 29 * DAY_MS + 3 * HOUR_MS),
      row("hourly", MONDAY + 28 * DAY_MS + 22 * HOUR_MS),
      row("daily", MONDAY + 20 * DAY_MS + 22 * HOUR_MS),
      row("daily", MONDAY + 2 * DAY_MS),
      row("weekly", MONDAY, 1, true),
    ];
    const now = MONDAY + 29 * DAY_MS + 4 * HOUR_MS;

    const once = apply(rows, planRetention(rows, now));

    expect(planRetention(once, now)).toEqual([]);
  });

  // Une pyramide vide n'a rien à faire
  it("has nothing to do without rows", () => {
    expect(planRetention([], MONDAY)).toEqual([]);
  });
});

describe("the budget of the fine history (JOURNAL 2026-10-08)", () => {
  const chunk = (canvasId: string, fromVersion: number, toTs: number, size: number) => ({
    canvasId,
    fromVersion,
    toVersion: fromVersion + 99,
    toTs,
    size,
  });
  const now = MONDAY + 30 * DAY_MS;
  const daysAgo = (days: number) => now - days * DAY_MS;

  // 700 Mo pour le scope prod, 50 Mo pour tous les autres
  it("gives 700 MB to the prod scope and 50 MB to any other", () => {
    expect(historyBudgetBytes("prod")).toBe(HISTORY_BUDGET_PROD_BYTES);
    expect(HISTORY_BUDGET_PROD_BYTES).toBe(700 * 1024 * 1024);
    expect(historyBudgetBytes("beta")).toBe(HISTORY_BUDGET_OTHER_BYTES);
    expect(historyBudgetBytes("poste-2")).toBe(50 * 1024 * 1024);
  });

  // Sous le budget, rien ne part
  it("purges nothing under the budget", () => {
    expect(purgeableRanges([chunk("a", 1, daysAgo(20), 100)], 100, 100, now)).toEqual([]);
  });

  // Au-dessus, le plus ancien part d'abord, canvas confondus, et seulement ce qu'il faut pour revenir au budget
  it("purges the oldest first, across canvases, and only what it takes to get back to the budget", () => {
    const oldest = [
      chunk("a", 1, daysAgo(20), 40),
      chunk("b", 1, daysAgo(19), 40),
      chunk("a", 101, daysAgo(18), 40),
      chunk("b", 101, daysAgo(10), 40),
    ];

    const ranges = purgeableRanges(oldest, 160, 100, now);

    expect(ranges).toEqual([
      { canvasId: "a", beforeVersion: 101, beforeTs: daysAgo(20) + 1, chunks: 1, bytes: 40 },
      { canvasId: "b", beforeVersion: 101, beforeTs: daysAgo(19) + 1, chunks: 1, bytes: 40 },
    ]);
  });

  // Plusieurs chunks d'un même canvas font une seule plage, jusqu'au dernier retiré
  it("makes one range of several chunks of the same canvas, up to the last one removed", () => {
    const oldest = [
      chunk("a", 1, daysAgo(20), 40),
      chunk("a", 101, daysAgo(19), 40),
      chunk("a", 201, daysAgo(18), 40),
    ];

    expect(purgeableRanges(oldest, 120, 50, now)).toEqual([
      { canvasId: "a", beforeVersion: 201, beforeTs: daysAgo(19) + 1, chunks: 2, bytes: 80 },
    ]);
  });

  // Le plancher de 7 jours l'emporte sur le budget : rien de plus récent ne part, même au-dessus
  it("never goes under seven days of history, even over the budget", () => {
    const oldest = [
      chunk("a", 1, now - HISTORY_FLOOR_MS - 1, 40),
      chunk("a", 101, now - HISTORY_FLOOR_MS, 40),
      chunk("a", 201, daysAgo(1), 40),
    ];

    const ranges = purgeableRanges(oldest, 10_000, 0, now);

    expect(ranges).toEqual([
      { canvasId: "a", beforeVersion: 101, beforeTs: now - HISTORY_FLOOR_MS, chunks: 1, bytes: 40 },
    ]);
  });

  // Un historique tout entier sous le plancher n'a aucune plage purgeable
  it("has no purgeable range when all the history is inside the floor", () => {
    expect(
      purgeableRanges([chunk("a", 1, daysAgo(2), 40), chunk("a", 101, daysAgo(1), 40)], 80, 0, now),
    ).toEqual([]);
  });

  // Le total est celui de Convex, pas de la page : une page des plus anciens ne dit pas combien reste
  it("takes the total from Convex, not from the page of oldest chunks it is given", () => {
    const page = [chunk("a", 1, daysAgo(20), 10)];

    expect(purgeableRanges(page, 1000, 995, now)).toEqual([
      { canvasId: "a", beforeVersion: 101, beforeTs: daysAgo(20) + 1, chunks: 1, bytes: 10 },
    ]);
    expect(purgeableRanges(page, 1000, 1000, now)).toEqual([]);
  });
});
