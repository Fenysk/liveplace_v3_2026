import { describe, expect, it } from "vitest";
import {
  createHistoryPlan,
  HISTORY_INTERVAL_MS,
  HISTORY_MIN_INTERVAL_MS,
  HISTORY_PENDING_MAX,
  HISTORY_RETRY_MS,
} from "./history-plan";

const t0 = 1_700_000_000_000;
const CANVAS = "canvas-1";

// Un canvas déjà rangé jusqu'à la version 100 : le curseur que Convex rend au démarrage
const seededPlan = () => {
  const plan = createHistoryPlan();
  plan.seed([{ canvasId: CANVAS, version: 100 }], t0);
  return plan;
};

describe("when an archive is due (Écart §7.2, JOURNAL 2026-10-08)", () => {
  // Quand des entrées ne sont pas archivées, le tour de cinq minutes les prend, pas avant
  it("takes entries not archived yet at the five-minute turn, not before", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 105, t0 + 1_000);

    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Quand 5 000 entrées attendent, le canvas est dû tout de suite, sans attendre le tour
  it("is due at once when five thousand entries are waiting", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 100 + HISTORY_PENDING_MAX, t0 + 1_000);

    expect(plan.listDue(t0 + 1_000)).toEqual([CANVAS]);
  });

  // Quand 4 999 entrées attendent, le seuil n'est pas atteint
  it("is not due early with one entry less than the threshold", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 100 + HISTORY_PENDING_MAX - 1, t0 + 1_000);

    expect(plan.listDue(t0 + 1_000)).toEqual([]);
  });

  // Quand rien ne dépasse le curseur, rien n'est dû, même après des heures
  it("is never due while the version stays on the cursor", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 100, t0 + 1_000);

    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 100)).toEqual([]);
  });

  // Quand Redis est revenu en arrière (une version sous le curseur), rien n'est dû non plus
  it("is not due when Redis is behind the cursor", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 40, t0 + 1_000);

    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 100)).toEqual([]);
  });

  // Quand un canvas n'a pas de curseur, il commence à zéro, comme Convex qui n'a rien rangé de lui
  it("starts from zero for a canvas Convex holds nothing of", () => {
    const plan = createHistoryPlan();
    plan.noteVersion("fresh", 3, t0);

    expect(plan.getCursor("fresh")).toBe(0);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS)).toEqual(["fresh"]);
  });

  // Quand le tour de cinq minutes est passé, la version la plus haute vue compte, pas la première
  it("counts the highest version seen, whatever order they arrive in", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 120, t0);
    plan.noteVersion(CANVAS, 110, t0 + 10);

    plan.noteArchived(CANVAS, 110, t0 + HISTORY_INTERVAL_MS);

    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 2)).toEqual([CANVAS]);
  });
});

describe("after a chunk was stored", () => {
  // Quand un chunk est rangé, le curseur avance et rien n'est dû tant que rien de neuf n'est arrivé
  it("moves the cursor and is no longer due until something new arrives", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 110, t0);
    plan.noteArchived(CANVAS, 110, t0 + HISTORY_INTERVAL_MS);

    expect(plan.getCursor(CANVAS)).toBe(110);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 3)).toEqual([]);

    plan.noteVersion(CANVAS, 111, t0 + HISTORY_INTERVAL_MS * 3);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 4)).toEqual([CANVAS]);
  });

  // Quand un tour a lu sans trouver d'entrée (une version de taille seule), il ne boucle pas avant une version de plus
  it("does not loop on a read that found nothing, until a newer version arrives", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 101, t0);
    plan.noteChecked(CANVAS, 101, t0 + HISTORY_INTERVAL_MS);

    expect(plan.getCursor(CANVAS)).toBe(100);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 10)).toEqual([]);

    plan.noteVersion(CANVAS, 102, t0 + HISTORY_INTERVAL_MS * 10);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 20)).toEqual([CANVAS]);
  });

  // Quand le seuil de 5 000 est dépassé de beaucoup, le chunk suivant attend au moins cinq secondes
  it("waits at least five seconds before the next chunk of a backlog", () => {
    const plan = createHistoryPlan();
    plan.noteVersion(CANVAS, 3 * HISTORY_PENDING_MAX, t0);
    expect(plan.listDue(t0)).toEqual([CANVAS]);

    plan.noteArchived(CANVAS, HISTORY_PENDING_MAX, t0 + 200);

    expect(plan.listDue(t0 + 200 + HISTORY_MIN_INTERVAL_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + 200 + HISTORY_MIN_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Quand le rangement échoue, le canvas reste à faire et on réessaie après trente secondes
  it("retries after thirty seconds when the chunk could not be stored", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 100 + HISTORY_PENDING_MAX, t0);
    plan.noteFailed(CANVAS, t0 + 100);

    expect(plan.listDue(t0 + 100 + HISTORY_RETRY_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + 100 + HISTORY_RETRY_MS)).toEqual([CANVAS]);
  });

  // Quand Convex dit autre chose (un chevauchement), le curseur prend la valeur de Convex
  it("takes the cursor Convex gives back after an overlap", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 150, t0);

    plan.seed([{ canvasId: CANVAS, version: 150 }], t0 + 1_000);

    expect(plan.getCursor(CANVAS)).toBe(150);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 10)).toEqual([]);
  });
});

describe("a recovery (JOURNAL 2026-10-08)", () => {
  // Le saut de version d'une récupération n'est pas un million d'entrées : seules celles d'après font partir un chunk
  it("does not count the version jump of a recovery as entries waiting", () => {
    const plan = seededPlan();
    plan.noteFloor(CANVAS, 1_000_100, t0);
    plan.noteVersion(CANVAS, 1_000_103, t0);

    expect(plan.listDue(t0 + 1_000)).toEqual([]);
    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Cinq mille entrées après le saut font bien partir un chunk tout de suite
  it("is due at once when five thousand entries wait after the jump", () => {
    const plan = seededPlan();
    plan.noteFloor(CANVAS, 1_000_100, t0);
    plan.noteVersion(CANVAS, 1_000_100 + HISTORY_PENDING_MAX, t0);

    expect(plan.listDue(t0 + 1_000)).toEqual([CANVAS]);
  });
});

describe("a discarded canvas", () => {
  // Quand le canvas est supprimé, plus rien n'est dû, ni pour une version vue après, ni pour un rangement en cours
  it("is never due again once dropped", () => {
    const plan = seededPlan();
    plan.noteVersion(CANVAS, 100 + HISTORY_PENDING_MAX, t0);
    plan.drop(CANVAS);
    plan.noteVersion(CANVAS, 100 + HISTORY_PENDING_MAX * 2, t0 + 10);
    plan.noteArchived(CANVAS, 120, t0 + 20);
    plan.noteFailed(CANVAS, t0 + 30);

    expect(plan.listDue(t0 + HISTORY_INTERVAL_MS * 100)).toEqual([]);
  });
});
