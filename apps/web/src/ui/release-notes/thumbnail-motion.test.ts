import { PALETTE } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { DRAFT_CELL, DRAFT_ORIGIN, DRAFT_STROKES } from "./draft-strokes";
import { GROWTH_PLACEMENTS, motifCells } from "./pixel-motifs";
import {
  ARCHIVE_COUNT,
  ARCHIVE_LOOP_MS,
  ARCHIVE_RESTING_MS,
  ARCHIVE_SLOTS,
  archiveAt,
  BACKGROUND_OPTIONS,
  BACKGROUND_RESTING_MS,
  backgroundAt,
  GROWTH_CELLS,
  GROWTH_HEIGHT,
  GROWTH_WIDTH,
  growthAt,
  LOOP_MS,
  MODERATION_RESTING_MS,
  moderationAt,
  PODIUM_SIZE,
  podiumAt,
  RESTING_MS,
  UNDO_LOOP_MS,
  UNDO_RESTING_MS,
  undoAt,
} from "./thumbnail-motion";

const area = ([x0, y0, x1, y1]: readonly [number, number, number, number]): number => (x1 - x0) * (y1 - y0);
const MOTIF_SIZES = GROWTH_PLACEMENTS.map(({ motif, x, y }) => motifCells(motif, x, y).length);

describe("la fresque qui grandit (vignette)", () => {
  // Au début de la boucle, la fresque n'entoure que le premier motif, encore vide
  it("starts small and empty, around the first motif only", () => {
    const moment = growthAt(0);

    expect(moment.shown.every((count) => count === 0)).toBe(true);
    expect(area(moment.bounds)).toBeLessThan(area(growthAt(RESTING_MS).bounds));
  });

  // La fresque ne rapetisse jamais pendant la boucle, et finit autour de tous les motifs
  it("only grows during the loop and ends around every motif", () => {
    let previous = 0;
    for (let time = 0; time < LOOP_MS; time += 40) {
      const current = area(growthAt(time).bounds);
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = current;
    }
    const end = growthAt(RESTING_MS);
    expect(end.shown).toEqual(MOTIF_SIZES);
    expect(end.bounds[0]).toBeGreaterThanOrEqual(0);
    expect(end.bounds[2]).toBeLessThanOrEqual(GROWTH_WIDTH);
    expect(end.bounds[3]).toBeLessThanOrEqual(GROWTH_HEIGHT);
  });

  // Chaque étape pose un motif entier : à la fin de chaque étape de 0,8 s, ceux d'avant sont complets et ceux d'après n'ont pas commencé
  it("lays one whole motif per step, the next one starting only when it is complete", () => {
    GROWTH_PLACEMENTS.forEach((_, step) => {
      const shown = growthAt(step * 800 + 450).shown;

      expect(shown).toEqual(MOTIF_SIZES.map((size, index) => (index <= step ? size : 0)));
    });
  });

  // Un motif se pose rangée après rangée : en cours de pose, il n'est ni vide ni complet
  it("lays a motif row after row, never empty and never complete half way", () => {
    const halfWay = growthAt(800 + 120 + 140).shown[1] ?? 0;

    expect(halfWay).toBeGreaterThan(0);
    expect(halfWay).toBeLessThan(MOTIF_SIZES[1] ?? 0);
  });

  // La boucle repart au même point, et le même instant donne la même image
  it("loops every 4.8 seconds and gives the same moment for the same instant", () => {
    expect(growthAt(1234)).toEqual(growthAt(1234 + LOOP_MS));
    expect(growthAt(1234)).toEqual(growthAt(1234));
  });

  // Chaque motif garde 3 cases vides autour de lui : la fresque ne les touche jamais
  it("keeps every motif inside the margin of the canvas", () => {
    for (const { x, y } of GROWTH_CELLS) {
      expect(x).toBeGreaterThanOrEqual(3);
      expect(y).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(GROWTH_WIDTH - 4);
      expect(y).toBeLessThanOrEqual(GROWTH_HEIGHT - 4);
    }
  });

  // Chaque case a son identifiant, et dit à quel motif et à quel rang elle se pose : c'est ce que `shown` compte
  it("gives every cell its own id, with the motif and the order it is laid in", () => {
    const ids = GROWTH_CELLS.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(MOTIF_SIZES.reduce((total, size) => total + size, 0));
    for (const { motif, order, x, y, colorIndex } of GROWTH_CELLS) {
      const placement = GROWTH_PLACEMENTS[motif];
      expect(placement && motifCells(placement.motif, placement.x, placement.y)[order]).toEqual({
        x,
        y,
        colorIndex,
      });
    }
  });

  // Les couleurs sont celles de la palette de `domain`, jamais une valeur écrite ici
  it("takes its colors from the palette of the canvas", () => {
    for (const { colorIndex } of GROWTH_CELLS) expect(PALETTE[colorIndex]).toBeDefined();
  });
});

describe("le podium qui change de tête (vignette)", () => {
  // À chaque instant, les trois anneaux sont d'or, d'argent et de bronze : trois places, chacune une fois
  it("always gives the three places, each once", () => {
    for (let time = 0; time < LOOP_MS; time += 100)
      expect([...podiumAt(time).ranks].sort()).toEqual([0, 1, 2]);
  });

  // Toutes les 1,6 s, quelqu'un d'autre passe premier
  it("hands the first place to someone else every 1.6 seconds", () => {
    const firstAt = (time: number) => podiumAt(time).ranks.indexOf(0);
    const firsts = [firstAt(800), firstAt(2400), firstAt(4000)];

    expect(new Set(firsts).size).toBe(PODIUM_SIZE);
    expect(firstAt(800)).toBe(firstAt(800 + LOOP_MS));
  });

  // Les lignes glissent en 200 ms, puis restent à leur place ; l'anneau suit la place d'arrivée dès le début
  it("slides the rows in 200 ms and puts the ring on the new place from the start", () => {
    const sliding = podiumAt(1700);
    const settled = podiumAt(1900);

    expect(sliding.slots.some((slot) => !Number.isInteger(slot))).toBe(true);
    expect(sliding.ranks).toEqual(settled.ranks);
    expect(settled.slots).toEqual(settled.ranks);
  });
});

// Où est la mini-fresque `canvas` à l'instant `time`, et de combien elle se voit
const at = (time: number, canvas: number) => archiveAt(time).canvases[canvas] ?? { x: 0, y: 0, opacity: -1 };

// Quelle mini-fresque occupe la place `slot` (1 derrière, 2 au milieu, 3 devant) à l'arrêt de l'étape `step`
const slotCanvas = (step: number, slot: number): number => {
  const place = ARCHIVE_SLOTS[slot];
  return archiveAt(step * 1600 + 100).canvases.findIndex(
    (canvas) => canvas.x === place?.x && canvas.y === place?.y,
  );
};

// Les mini-fresques `among`, de l'arrière à l'avant dans l'ordre de dessin de `moment`
const stacked = (moment: ReturnType<typeof archiveAt>, among: readonly number[]): number[] =>
  [...among].sort((first, second) => moment.order.indexOf(first) - moment.order.indexOf(second));

describe("l'archivage qui recule (vignette)", () => {
  // Six fresques différentes se suivent : au moins cinq, et la boucle dure une étape de 1,6 s par fresque
  it("steps back through six different canvases, one step of 1.6 s each", () => {
    expect(ARCHIVE_COUNT).toBeGreaterThanOrEqual(5);
    expect(ARCHIVE_LOOP_MS).toBe(ARCHIVE_COUNT * 1600);
  });

  // À l'arrêt, la pile est celle d'une étape : la 0 devant, la 5 au milieu, la 4 derrière, la 1 attend d'entrer, les autres hors de vue
  it("rests as a stack of three: the first canvas in front, the next two behind it, the others out of sight", () => {
    const { canvases, order } = archiveAt(ARCHIVE_RESTING_MS);

    expect(canvases[0]).toEqual(ARCHIVE_SLOTS[3]);
    expect(canvases[5]).toEqual(ARCHIVE_SLOTS[2]);
    expect(canvases[4]).toEqual(ARCHIVE_SLOTS[1]);
    for (const waiting of [1, 2, 3]) expect(canvases[waiting]?.opacity).toBe(0);
    expect(order.at(-2)).toBe(0); // celle de devant est dessinée juste sous celle qui va entrer
  });

  // Chaque étape de 1,6 s commence par un arrêt d'une seconde : rien ne bouge
  it("holds still for the first second of every 1.6 s step", () => {
    for (const step of [0, 1, 2, 5])
      for (const offset of [0, 300, 999])
        expect(archiveAt(step * 1600 + offset).canvases).toEqual(archiveAt(step * 1600).canvases);
  });

  // Puis 0,6 s de mouvement : celle de devant passe au milieu, celle du milieu derrière, celle de derrière s'en va en fondu, une neuve entre devant en fondu
  it("moves for 0.6 s: each one steps back, the back one fades out and a new one fades in in front", () => {
    const before = archiveAt(0).canvases;
    const middle = archiveAt(1000 + 300).canvases;
    const early = archiveAt(1000 + 100).canvases;
    const after = archiveAt(1600).canvases;

    expect(middle[4]?.opacity ?? 1).toBeLessThan(0.3); // celle de derrière s'en va
    expect(early[1]?.opacity ?? 0).toBeGreaterThan(0.3); // la neuve arrive devant, vite
    expect(early[1]?.opacity ?? 1).toBeLessThan(1);
    expect(middle[1]?.opacity).toBe(1); // à la mi-course elle est déjà opaque
    expect(after[1]).toEqual(ARCHIVE_SLOTS[3]); // la 1 est maintenant devant
    expect(after[0]).toEqual(ARCHIVE_SLOTS[2]); // l'ancienne de devant au milieu
    expect(after[5]).toEqual(ARCHIVE_SLOTS[1]); // l'ancienne du milieu derrière
    expect(after[4]?.opacity).toBe(0); // la sortie a fini : plus rien à voir
    expect(before[1]?.opacity).toBe(0); // la neuve n'était pas encore là
  });

  // Elle sort vers l'arrière, en haut à gauche, et la neuve entre par l'avant, en bas à droite : le sens inverse du défilement d'avant
  it("leaves backward, toward the top left, and the new one comes in from the bottom right", () => {
    const start = at(1000, 4);
    const leaving = at(1300, 4);
    const entering = at(1300, 1);

    expect(leaving.x).toBeLessThan(start.x);
    expect(leaving.y).toBeLessThan(start.y);
    expect(entering.x).toBeLessThan(at(1000, 1).x);
    expect(entering.y).toBeLessThan(at(1000, 1).y);
    expect(at(1000, 1)).toEqual(ARCHIVE_SLOTS[4]); // elle part de la place d'entrée, invisible
  });

  // Jamais de manège : une fresque qui est partie reste invisible presque trois étapes, et revient seulement devant
  it("never comes back at once: a canvas that left stays out of sight for almost three steps", () => {
    let outSince: number | null = null;
    let longest = 0;
    for (let time = 1600; time < 1600 + ARCHIVE_LOOP_MS; time += 40) {
      const isOut = at(time, 0).opacity < 0.01;
      if (isOut && outSince === null) outSince = time;
      if (!isOut && outSince !== null) {
        longest = Math.max(longest, time - outSince);
        outSince = null;
      }
    }
    expect(longest).toBeGreaterThanOrEqual(2.5 * 1600);
  });

  // La fresque de devant à l'étape s est au milieu à l'étape s + 1, puis derrière, puis elle a disparu
  it("pushes the front canvas back: middle at the next step, behind at the one after, then gone", () => {
    for (let step = 0; step < ARCHIVE_COUNT; step++) {
      const front = slotCanvas(step, 3);

      expect(front).toBeGreaterThanOrEqual(0);
      expect(slotCanvas(step + 1, 2)).toBe(front);
      expect(slotCanvas(step + 2, 1)).toBe(front);
      expect(archiveAt((step + 3) * 1600 + 100).canvases[front]?.opacity).toBe(0);
    }
  });

  // Celle qui entre devant est neuve : elle n'occupait aucune des trois places de l'étape d'avant
  it("brings in a new canvas in front, one that held none of the three places the step before", () => {
    for (let step = 0; step < ARCHIVE_COUNT; step++) {
      const entering = slotCanvas(step + 1, 3);
      const stack = [slotCanvas(step, 3), slotCanvas(step, 2), slotCanvas(step, 1)];

      expect(entering).toBeGreaterThanOrEqual(0);
      expect(stack).not.toContain(entering);
      expect(archiveAt(step * 1600 + 100).canvases[entering]?.opacity).toBe(0);
    }
  });

  // La première et la dernière fresque de la pile sont toujours deux fresques différentes, et une fresque ne se voit jamais deux fois
  it("keeps the front and the back of the stack different, and never shows a canvas twice", () => {
    for (let step = 0; step < ARCHIVE_COUNT; step++) {
      const { canvases } = archiveAt(step * 1600 + 100);
      const visible = canvases.flatMap((canvas, index) => (canvas.opacity > 0.01 ? [index] : []));
      const front = canvases.findIndex((canvas) => canvas.opacity === 1);
      const back = canvases.findIndex((canvas) => Math.abs(canvas.opacity - 0.55) < 1e-9);

      expect(visible).toHaveLength(3);
      expect(front).toBeGreaterThanOrEqual(0);
      expect(back).toBeGreaterThanOrEqual(0);
      expect(front).not.toBe(back);
    }
  });

  // Celle qui entre est dessinée tout dessus, celle qui sort derrière en dessous, et l'ordre ne change qu'à une étape
  it("draws the entering canvas on top and the leaving one below, reordering only at a step", () => {
    const hold = archiveAt(300).order;
    const moving = archiveAt(1300).order;
    const next = archiveAt(1700).order;

    expect(moving).toEqual(hold);
    expect(hold.at(-1)).toBe(1); // celle qui va entrer est dessus
    expect(hold.indexOf(4)).toBeLessThan(hold.indexOf(5)); // celle de derrière est sous celle du milieu
    expect(next.at(-1)).toBe(2); // à l'étape suivante, c'est la 2 qui va entrer
    expect(new Set(next).size).toBe(ARCHIVE_COUNT);
  });

  // Quand l'ordre change, à chaque étape, aucune paire de fresques visibles ne change de côté : seule celle qui part, déjà invisible, bouge
  it("reorders only while the canvas that leaves is out of sight", () => {
    for (let step = 1; step <= ARCHIVE_COUNT; step++) {
      const before = archiveAt(step * 1600 - 1);
      const after = archiveAt(step * 1600);
      const visible = before.canvases.flatMap((canvas, index) =>
        canvas.opacity > 0.01 && (after.canvases[index]?.opacity ?? 0) > 0.01 ? [index] : [],
      );

      expect(visible).toHaveLength(3);
      expect(stacked(before, visible)).toEqual(stacked(after, visible));
    }
  });

  // Rien ne saute d'une image à l'autre quand on la voit, et la boucle se referme sur elle-même
  it("never jumps while visible, and the loop closes on itself", () => {
    for (let time = 0; time < ARCHIVE_LOOP_MS; time += 10) {
      const now = archiveAt(time).canvases;
      const next = archiveAt(time + 10).canvases;
      now.forEach((canvas, index) => {
        const other = next[index] ?? canvas;
        if (canvas.opacity > 0.01 || other.opacity > 0.01) {
          expect(Math.abs(other.x - canvas.x)).toBeLessThan(8);
          expect(Math.abs(other.opacity - canvas.opacity)).toBeLessThan(0.35);
        }
      });
    }
    expect(archiveAt(ARCHIVE_LOOP_MS)).toEqual(archiveAt(0));
    expect(archiveAt(1234)).toEqual(archiveAt(1234 + ARCHIVE_LOOP_MS));
  });
});

describe("le choix du fond qui tourne (vignette)", () => {
  const look = (time: number) => backgroundAt(time);

  // Quatre états de 1,2 s : la sélection passe de transparent à noir, à blanc, puis à l'image
  it("moves the selection through the four options, 1.2 s each", () => {
    expect(BACKGROUND_OPTIONS).toEqual(["transparent", "black", "white", "image"]);
    expect([600, 1800, 3000, 4200].map((time) => look(time).chosen)).toEqual([0, 1, 2, 3]);
  });

  // À l'arrêt, l'aperçu montre l'option choisie : le damier, le noir, le blanc, puis l'image par-dessus le blanc
  it("shows the chosen option once the fade is over", () => {
    expect(look(900)).toEqual({ chosen: 0, black: 0, white: 0, image: 0 });
    expect(look(2100)).toEqual({ chosen: 1, black: 1, white: 0, image: 0 });
    expect(look(3300)).toEqual({ chosen: 2, black: 0, white: 1, image: 0 });
    expect(look(4500)).toEqual({ chosen: 3, black: 0, white: 1, image: 1 });
  });

  // Le changement est un fondu court : au début d'un état, l'aperçu est encore à moitié chemin, puis il a fini avant 300 ms
  it("crosses over in a short fade, finished 300 ms after the selection moved", () => {
    const start = look(1200);
    const halfway = look(1200 + 100);
    const done = look(1200 + 300);

    expect(start.black).toBeCloseTo(0, 5);
    expect(halfway.black).toBeGreaterThan(0.3);
    expect(halfway.black).toBeLessThan(1);
    expect(done.black).toBe(1);
  });

  // Les poids restent entre 0 et 1, et la boucle se referme : l'image et le blanc s'effacent pour revenir au damier
  it("keeps every weight between 0 and 1, and closes the loop back on the checker", () => {
    for (let time = 0; time < LOOP_MS; time += 20) {
      const { black, white, image } = look(time);
      for (const weight of [black, white, image]) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
    expect(look(LOOP_MS)).toEqual(look(0));
    expect(look(10).white).toBeGreaterThan(0.5); // le blanc et l'image de l'état d'avant s'effacent
    expect(look(10).image).toBeGreaterThan(0.5);
  });

  // L'image fixe est l'image posée sur le fond blanc, la sélection sur elle
  it("rests on the image over white, the selection on the image", () => {
    expect(look(BACKGROUND_RESTING_MS)).toEqual({ chosen: 3, black: 0, white: 1, image: 1 });
  });
});

describe("la Modération en un clic (vignette)", () => {
  // L'image fixe : le point rouge est là, sans curseur ni liste ouverte
  it("rests on the red dot over the shield, with no cursor and no list", () => {
    const moment = moderationAt(MODERATION_RESTING_MS);

    expect(moment.dot).toBe(1);
    expect(moment.cursor).toBe(0);
    expect(moment.sheet).toBe(0);
    expect(moment.press).toBe(0);
  });

  // Dans l'ordre : le point paraît, le curseur vient sur le bouclier, il clique, le point s'éteint, la liste s'ouvre
  it("shows the dot, brings the cursor to the shield, clicks it, puts the dot out and opens the list", () => {
    expect(moderationAt(300).dot).toBe(0); // rien au début de la boucle
    expect(moderationAt(900).dot).toBe(1);
    expect(moderationAt(2000).cursor).toBe(1);
    expect(moderationAt(2000).approach).toBeGreaterThan(0.9);
    expect(moderationAt(2300).press).toBe(1); // l'appui est à son plus fort au clic
    expect(moderationAt(2600).dot).toBe(0);
    expect(moderationAt(3200).sheet).toBe(1);
  });

  // Tout se referme avant la boucle suivante : ni point, ni curseur, ni liste à la fin, et la boucle se referme sur elle-même
  it("closes everything before the loop starts again, and the loop closes on itself", () => {
    const end = moderationAt(LOOP_MS - 1);

    expect([end.dot, end.cursor, end.sheet, end.press]).toEqual([0, 0, 0, 0]);
    expect(moderationAt(LOOP_MS)).toEqual(moderationAt(0));
    for (let time = 0; time < LOOP_MS; time += 20)
      for (const value of Object.values(moderationAt(time))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
  });
});

describe("annuler, refaire (vignette)", () => {
  const STROKE_SIZES = DRAFT_STROKES.map(({ cells }) => cells.length);
  const [CAP_SIZE = 0] = STROKE_SIZES;

  // L'image fixe : les trois traits posés, la troisième pastille choisie, Annuler et Vider dégrisés, Refaire grisé, aucun appui
  it("rests on the three strokes placed, Undo ready and Redo greyed", () => {
    const moment = undoAt(UNDO_RESTING_MS);

    expect(moment.shown).toEqual(STROKE_SIZES);
    expect(moment.opacity).toEqual([1, 1, 1]);
    expect(moment.armed).toBe(2);
    expect([moment.canUndo, moment.canRedo, moment.canDiscard]).toEqual([true, false, true]);
    expect([moment.undoTap, moment.redoTap]).toEqual([0, 0]);
  });

  // Au début de la boucle, rien n'est posé : tous les outils sont grisés, la première pastille est choisie, la souris n'est pas là
  it("starts on an empty draft with every tool greyed and no mouse", () => {
    const start = undoAt(0);

    expect(start.shown).toEqual([0, 0, 0]);
    expect(start.armed).toBe(0);
    expect([start.canUndo, start.canRedo, start.canDiscard]).toEqual([false, false, false]);
    expect(start.pointer.opacity).toBe(0);
  });

  // Les trois traits se posent l'un après l'autre, chacun avec sa pastille choisie : le suivant ne commence qu'après le précédent
  it("places the strokes one after the other, each with its own swatch chosen", () => {
    expect(undoAt(700).shown[0]).toBeGreaterThan(0);
    expect(undoAt(700).shown[0]).toBeLessThan(CAP_SIZE);
    expect(undoAt(700).shown[1]).toBe(0);
    expect(undoAt(1700).armed).toBe(1);
    expect(undoAt(1700).shown[0]).toBe(CAP_SIZE);
    expect(undoAt(1700).shown[2]).toBe(0);
    expect(undoAt(2500).armed).toBe(2);
    expect(undoAt(2500).canUndo).toBe(true);
  });

  // Annuler retire le dernier trait (le pied), puis l'avant-dernier (les points) ; Refaire se dégrise dès le premier appui
  it("takes the stem away with the first Undo, then the spots with the second", () => {
    expect(undoAt(3800).undoTap).toBe(1);
    expect(undoAt(3800).canRedo).toBe(true);
    expect(undoAt(4000).opacity).toEqual([1, 1, 0]);
    expect(undoAt(4700).undoTap).toBe(1);
    expect(undoAt(5000).opacity).toEqual([1, 0, 0]);
    expect(undoAt(5000).canUndo).toBe(true); // le chapeau reste posé
  });

  // Refaire remet les points, pas le pied : il attend encore, donc Refaire reste dégrisé
  it("brings the spots back with Redo, and only them", () => {
    expect(undoAt(5600).redoTap).toBe(1);
    expect(undoAt(6000).opacity).toEqual([1, 1, 0]);
    expect(undoAt(6000).canRedo).toBe(true);
    expect(undoAt(6000).canUndo).toBe(true);
  });

  // Un trait s'efface et revient en fondu court, jamais d'un coup
  it("fades a stroke out and back in over 150 ms, never in one step", () => {
    expect(undoAt(3850).opacity[2]).toBeGreaterThan(0);
    expect(undoAt(3850).opacity[2]).toBeLessThan(1);
    expect(undoAt(5650).opacity[1]).toBeGreaterThan(0);
    expect(undoAt(5650).opacity[1]).toBeLessThan(1);
  });

  // La souris reste sur le champignon pendant qu'elle trace, va à Annuler avant le premier clic et à Refaire avant le sien
  it("keeps the mouse over the mushroom while it draws, then brings it to Undo and to Redo", () => {
    for (let time = 400; time <= 2900; time += 50) {
      const { ax, ay, by } = undoAt(time).pointer;

      expect(ax).toBeGreaterThanOrEqual(DRAFT_ORIGIN.x);
      expect(ax).toBeLessThanOrEqual(DRAFT_ORIGIN.x + 7 * DRAFT_CELL);
      expect(ay).toBeGreaterThanOrEqual(DRAFT_ORIGIN.y);
      expect(ay).toBeLessThanOrEqual(DRAFT_ORIGIN.y + 7 * DRAFT_CELL);
      expect(by).toBe(0);
    }
    const onUndo = undoAt(3700).pointer;
    const onRedo = undoAt(5500).pointer;

    expect([onUndo.ax, onUndo.ay, onUndo.bx, onUndo.by]).toEqual([56, 64, 1, -10]);
    expect([onRedo.ax, onRedo.ay, onRedo.bx, onRedo.by]).toEqual([56, 64, 17, -10]);
  });

  // À la fin, le brouillon se vide en fondu (la souris avec lui) ; la boucle se referme sur elle-même
  it("clears the draft at the end of the loop, which closes on itself", () => {
    expect(undoAt(7600).canUndo).toBe(false);
    expect(undoAt(7800).opacity[0]).toBeGreaterThan(0);
    expect(undoAt(7800).opacity[0]).toBeLessThan(1);
    expect(undoAt(8100).opacity).toEqual([0, 0, 0]);
    expect(undoAt(8100).pointer.opacity).toBe(0);
    expect(undoAt(UNDO_LOOP_MS)).toEqual(undoAt(0));
  });
});

describe("l'ordre des gestes de la vignette de la Modération", () => {
  // Le curseur est sur le bouclier avant le clic, et le clic vient avant l'ouverture de la liste
  it("has the cursor on the shield before the click, and the click before the list opens", () => {
    expect(moderationAt(2199).approach).toBeGreaterThan(0.99);
    expect(moderationAt(2100).press).toBe(0);
    expect(moderationAt(2300).press).toBe(1);
    expect(moderationAt(2399).sheet).toBe(0);
    expect(moderationAt(2450).sheet).toBeGreaterThan(0);
  });

  // Le point s'éteint avec le clic : il n'est plus là quand la liste est ouverte
  it("puts the dot out with the click, so it is gone when the list is open", () => {
    expect(moderationAt(2299).dot).toBe(1);
    expect(moderationAt(2500).dot).toBe(0);
    expect(moderationAt(3000).dot).toBe(0);
    expect(moderationAt(3000).sheet).toBe(1);
  });
});
