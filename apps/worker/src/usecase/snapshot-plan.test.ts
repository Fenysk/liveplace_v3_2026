import { describe, expect, it } from "vitest";
import {
  createSnapshotPlan,
  MIN_INTERVAL_MS,
  PLACEMENT_INTERVAL_MS,
  REFRESH_INTERVAL_MS,
  RETRY_MS,
  URGENT_DEBOUNCE_MS,
  URGENT_MAX_WAIT_MS,
} from "./snapshot-plan";

const t0 = 1_700_000_000_000;
const CANVAS = "canvas-1";

// Un canvas déjà sauvegardé à `t0`, à la version 10 : le point de départ de la plupart des cas
const savedPlan = () => {
  const plan = createSnapshotPlan();
  plan.seed([{ canvasId: CANVAS, version: 10, takenAt: t0 }]);
  return plan;
};

describe("a placement (Écart §7.2, JOURNAL 2026-10-06)", () => {
  // Quand une pose arrive, le snapshot attend cinq minutes après le dernier : perdre cinq minutes de poses est accepté
  it("waits five minutes after the last snapshot", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);

    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Quand un canvas n'a encore jamais été sauvegardé, sa première pose le rend dû tout de suite
  it("is due at once for a canvas that was never saved", () => {
    const plan = createSnapshotPlan();
    plan.noteActivity(CANVAS, true, t0);

    expect(plan.listDue(t0)).toEqual([CANVAS]);
  });

  // Quand la pose a été sauvegardée, rien n'est dû tant qu'il ne se passe rien
  it("is no longer due once saved", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.noteSaved(CANVAS, 11, t0 + PLACEMENT_INTERVAL_MS, t0 + PLACEMENT_INTERVAL_MS + 200);

    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS * 2)).toEqual([]);
  });
});

describe("a moderation, a setting or a new size", () => {
  // Quand la modération bouge, le snapshot suit après une demi-seconde de calme, bien avant les cinq minutes
  it("is due after half a second of calm", () => {
    const plan = savedPlan();
    const at = t0 + MIN_INTERVAL_MS * 4;
    plan.noteActivity(CANVAS, false, at);

    expect(plan.listDue(at + URGENT_DEBOUNCE_MS - 1)).toEqual([]);
    expect(plan.listDue(at + URGENT_DEBOUNCE_MS)).toEqual([CANVAS]);
  });

  // Tant que les actions s'enchaînent, le snapshot attend le calme, mais jamais plus que le délai maximal
  it("keeps waiting for calm while actions chain, but never past the maximum wait", () => {
    const plan = savedPlan();
    const first = t0 + MIN_INTERVAL_MS * 4;
    for (let elapsed = 0; elapsed < URGENT_MAX_WAIT_MS; elapsed += URGENT_DEBOUNCE_MS / 2)
      plan.noteActivity(CANVAS, false, first + elapsed);

    expect(plan.listDue(first + URGENT_MAX_WAIT_MS - 1)).toEqual([]);
    expect(plan.listDue(first + URGENT_MAX_WAIT_MS)).toEqual([CANVAS]);
  });

  // Au plus un snapshot toutes les cinq secondes par canvas, même sous une rafale de modération
  it("never snapshots a canvas more than once every five seconds", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, false, t0 + 1_000);

    expect(plan.listDue(t0 + 2_500)).toEqual([]);
    expect(plan.listDue(t0 + MIN_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Une modération passe avant une pose : elle ne attend pas les cinq minutes
  it("does not wait for the placement tick when a pose was waiting too", () => {
    const plan = savedPlan();
    const at = t0 + MIN_INTERVAL_MS * 4;
    plan.noteActivity(CANVAS, true, at - 500);
    plan.noteActivity(CANVAS, false, at);

    expect(plan.listDue(at + URGENT_DEBOUNCE_MS)).toEqual([CANVAS]);
  });
});

describe("what happens while a snapshot is being read", () => {
  // Quand une pose arrive pendant la lecture, le canvas reste à faire : le snapshot n'a pas pu la voir
  it("keeps a canvas dirty when an action came after the read started", () => {
    const plan = savedPlan();
    const startedAt = t0 + PLACEMENT_INTERVAL_MS;
    plan.noteActivity(CANVAS, true, startedAt - 1_000);
    plan.noteActivity(CANVAS, true, startedAt + 50);
    plan.noteSaved(CANVAS, 12, startedAt, startedAt + 200);

    expect(plan.listDue(startedAt + 200 + PLACEMENT_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Quand une modération arrive pendant la lecture, elle reste urgente après la sauvegarde
  it("keeps an urgent action urgent when it came after the read started", () => {
    const plan = savedPlan();
    const startedAt = t0 + MIN_INTERVAL_MS * 4;
    plan.noteActivity(CANVAS, false, startedAt + 50);
    plan.noteSaved(CANVAS, 12, startedAt, startedAt + 200);

    expect(plan.listDue(startedAt + 200 + MIN_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Si la sauvegarde échoue, le canvas reste à faire et on réessaie après trente secondes, pas à la boucle suivante
  it("retries after thirty seconds when saving fails", () => {
    const plan = createSnapshotPlan();
    plan.noteActivity(CANVAS, true, t0);
    plan.noteFailed(CANVAS, t0 + 100);

    expect(plan.listDue(t0 + 100 + RETRY_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + 100 + RETRY_MS)).toEqual([CANVAS]);
  });
});

describe("the oldest modification not saved yet (JOURNAL 2026-10-08)", () => {
  // Rien n'est arrivé, rien n'attend : pas de retard
  it("is nothing when nothing happened", () => {
    expect(savedPlan().getOldestUnsavedAt()).toBeNull();
  });

  // Le retard se compte depuis la première modification qui attend, pas la dernière
  it("dates from the first modification that waits, not the last", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.noteActivity(CANVAS, true, t0 + 4_000);
    plan.noteActivity(CANVAS, false, t0 + 6_000);

    expect(plan.getOldestUnsavedAt()).toBe(t0 + 1_000);
  });

  // Tous canvas confondus, la plus ancienne gagne
  it("takes the oldest of all the canvases", () => {
    const plan = savedPlan();
    plan.noteActivity("canvas-2", true, t0 + 500);
    plan.noteActivity(CANVAS, true, t0 + 100);

    expect(plan.getOldestUnsavedAt()).toBe(t0 + 100);
  });

  // Sauvegardé, plus rien n'attend
  it("is nothing again once saved", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.noteSaved(CANVAS, 11, t0 + 2_000, t0 + 2_200);

    expect(plan.getOldestUnsavedAt()).toBeNull();
  });

  // Une modification arrivée pendant la lecture reste en attente, depuis le début de cette lecture
  it("keeps what came after the read started, from the start of that read", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.noteActivity(CANVAS, true, t0 + 2_500);
    plan.noteSaved(CANVAS, 11, t0 + 2_000, t0 + 2_200);

    expect(plan.getOldestUnsavedAt()).toBe(t0 + 2_000);
  });

  // Une sauvegarde qui échoue ne remet rien à zéro : le retard continue de croître
  it("keeps growing while saving fails", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.noteFailed(CANVAS, t0 + 2_000);

    expect(plan.getOldestUnsavedAt()).toBe(t0 + 1_000);
  });

  // Un Redis en avance sur Convex, vu au balayage, attend lui aussi
  it("counts a canvas the sweep finds ahead of its last save", () => {
    const plan = savedPlan();
    plan.noteVersion(CANVAS, 11, t0 + 3_000);

    expect(plan.getOldestUnsavedAt()).toBe(t0 + 3_000);
  });

  // Un canvas supprimé ne retarde rien
  it("ignores a canvas once it is dropped", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, true, t0 + 1_000);
    plan.drop(CANVAS);

    expect(plan.getOldestUnsavedAt()).toBeNull();
  });
});

describe("a discarded canvas (Écart §8.1, JOURNAL 2026-10-08)", () => {
  // Une archive supprimée n'est plus sauvegardée, ni par une activité, ni par un balayage, ni par une sauvegarde en cours
  it("is never due again once dropped, whatever the activity, the sweep or a save in flight", () => {
    const plan = savedPlan();
    plan.noteActivity(CANVAS, false, t0 + MIN_INTERVAL_MS * 4);
    plan.drop(CANVAS);
    plan.noteActivity(CANVAS, false, t0 + MIN_INTERVAL_MS * 5);
    plan.noteVersion(CANVAS, 99, t0 + MIN_INTERVAL_MS * 5);
    plan.noteSaved(CANVAS, 10, t0, t0 + MIN_INTERVAL_MS * 5);
    plan.noteFailed(CANVAS, t0 + MIN_INTERVAL_MS * 5);

    expect(plan.listDue(t0 + REFRESH_INTERVAL_MS * 2)).toEqual([]);
  });
});

describe("the sweep and the seed", () => {
  // Quand le balayage voit une version plus haute que la sauvegarde, le canvas est à refaire au tour des cinq minutes
  it("marks a canvas dirty when Redis is ahead of the last save", () => {
    const plan = savedPlan();
    plan.noteVersion(CANVAS, 11, t0 + 1_000);

    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS)).toEqual([CANVAS]);
  });

  // Quand la version n'a pas bougé, rien n'est à refaire
  it("leaves a canvas alone when the version has not moved", () => {
    const plan = savedPlan();
    plan.noteVersion(CANVAS, 10, t0 + 1_000);

    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS * 2)).toEqual([]);
  });

  // Un canvas en version 0 est demandé à la source une fois : elle garde ce que la modération ou la progression valent
  // (JOURNAL 2026-10-08). Une fois demandé, il n'est plus dû tant que rien ne passe sur son canal
  it("asks about a canvas at version 0 once, then leaves it alone until something happens", () => {
    const plan = createSnapshotPlan();
    plan.noteVersion("fresh", 0, t0);

    expect(plan.listDue(t0)).toEqual(["fresh"]);

    plan.noteSaved("fresh", 0, t0, t0 + 50);
    plan.noteVersion("fresh", 0, t0 + 60_000);
    expect(plan.listDue(t0 + 60_000)).toEqual([]);

    plan.noteActivity("fresh", false, t0 + 70_000);
    expect(plan.listDue(t0 + 70_000 + MIN_INTERVAL_MS)).toEqual(["fresh"]);
  });

  // Un canvas que le balayage découvre, et qui n'a aucune sauvegarde, est dû tout de suite
  it("saves a canvas the sweep discovers without any save at once", () => {
    const plan = createSnapshotPlan();
    plan.noteVersion(CANVAS, 3, t0);

    expect(plan.listDue(t0)).toEqual([CANVAS]);
  });

  // Une version de Redis plus basse que la sauvegarde (un Redis revenu en arrière) ne refait rien : Convex la refuserait
  it("does nothing when Redis is behind the last save", () => {
    const plan = savedPlan();
    plan.noteVersion(CANVAS, 4, t0 + 1_000);

    expect(plan.listDue(t0 + PLACEMENT_INTERVAL_MS * 2)).toEqual([]);
  });

  // Quand un canvas n'a pas bougé depuis un jour, il est refait quand même : un réglage sans version a pu passer
  it("refreshes a quiet canvas once a day, since a setting changes nothing in the version", () => {
    const plan = savedPlan();

    expect(plan.listDue(t0 + REFRESH_INTERVAL_MS - 1)).toEqual([]);
    expect(plan.listDue(t0 + REFRESH_INTERVAL_MS)).toEqual([CANVAS]);
  });
});
