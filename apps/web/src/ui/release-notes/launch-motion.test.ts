import { describe, expect, it } from "vitest";
import {
  ARRIVAL_CELLS,
  ARRIVALS,
  arrivalAt,
  CLICK_SIGN_IN_MS,
  LAUNCH_LOOP_MS,
  LAUNCH_RESTING_MS,
  launchAt,
  SIGN_IN_SPOT,
} from "./launch-motion";

describe("Lancement de LivePlace (vignette)", () => {
  // L'image fixe : le compte connecté, les trois dessins en entier, la pill de l'invité partie, aucune souris
  it("rests on the signed-in account with the three drawings fully arrived, and no mouse", () => {
    const moment = launchAt(LAUNCH_RESTING_MS);

    expect(moment.guest).toBe(0);
    expect(moment.account).toBe(1);
    expect(moment.drawings).toBe(1);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.signInTap).toBe(0);
    for (const [drawing, cells] of ARRIVAL_CELLS.entries())
      for (const index of cells.keys()) expect(arrivalAt(drawing, index, LAUNCH_RESTING_MS)).toBe(1);
  });

  // La pointe tombe sur Se connecter au clic, qui l'enfonce ; la pill de l'invité ne part qu'après le clic
  it("puts the tip on Sign in at the click, and keeps the guest pill until after it", () => {
    const onClick = launchAt(CLICK_SIGN_IN_MS);

    expect([onClick.pointer.ax, onClick.pointer.ay, onClick.pointer.bx, onClick.pointer.by]).toEqual([
      SIGN_IN_SPOT.ax,
      SIGN_IN_SPOT.ay,
      SIGN_IN_SPOT.bx,
      SIGN_IN_SPOT.by,
    ]);
    expect(onClick.signInTap).toBe(1);
    expect(onClick.press).toBe(1);
    expect(launchAt(CLICK_SIGN_IN_MS).guest).toBe(1);
    expect(launchAt(CLICK_SIGN_IN_MS).account).toBe(0);
  });

  // L'une laisse la place à l'autre : à mi-chemin les deux se voient, à la fin il ne reste que le compte connecté
  it("crosses the guest pill into the signed-in account", () => {
    expect(launchAt(1750).guest).toBeGreaterThan(0);
    expect(launchAt(1750).guest).toBeLessThan(1);
    expect(launchAt(1750).account).toBeGreaterThan(0);
    expect(launchAt(1750).account).toBeLessThan(1);
    expect(launchAt(2500).guest).toBe(0);
    expect(launchAt(2500).account).toBe(1);
  });

  // Les trois dessins arrivent l'un après l'autre : le suivant ne commence qu'après que le précédent a fini
  it("brings the three drawings one after the other, each fully arrived before the next starts", () => {
    expect(ARRIVALS).toHaveLength(3);
    for (const [drawing, { startMs }] of ARRIVALS.entries()) {
      const cells = ARRIVAL_CELLS[drawing]?.length ?? 0;
      const next = ARRIVALS[drawing + 1];
      expect(arrivalAt(drawing, 0, startMs - 1)).toBe(0);
      expect(arrivalAt(drawing, cells - 1, startMs)).toBe(0);
      if (next) expect(arrivalAt(drawing, cells - 1, next.startMs)).toBe(1);
    }
  });

  // Dans un dessin, les cases arrivent à la suite, en fondu : la première avant la dernière, chacune de 0 à 1
  it("fades the cells of a drawing in one after the other, as the cells of other players do in the game", () => {
    const [first] = ARRIVALS;
    const size = ARRIVAL_CELLS[0]?.length ?? 0;
    const start = first?.startMs ?? 0;

    expect(arrivalAt(0, 0, start + 150)).toBeGreaterThan(0);
    expect(arrivalAt(0, 0, start + 150)).toBeLessThan(1);
    expect(arrivalAt(0, size - 1, start + 150)).toBe(0);
    expect(arrivalAt(0, 0, start + 300)).toBe(1);
    expect(arrivalAt(0, size - 1, start + 1500)).toBe(1);
  });

  // Les trois dessins sont trois motifs différents, génériques, à des endroits différents de la fresque
  it("draws three different generic motifs at three different places", () => {
    expect(new Set(ARRIVALS.map(({ motif }) => motif)).size).toBe(3);
    expect(new Set(ARRIVALS.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
  });

  // Tout part en fondu avant que la boucle reparte, l'invité revient, et la boucle se referme sur elle-même
  it("fades everything out, brings the guest back, and closes the loop on itself", () => {
    expect(launchAt(7550).drawings).toBeGreaterThan(0);
    expect(launchAt(7550).drawings).toBeLessThan(1);
    expect(launchAt(7550).account).toBeLessThan(1);
    expect(launchAt(7900).drawings).toBe(0);
    expect(launchAt(7900).account).toBe(0);
    expect(launchAt(8000).guest).toBeGreaterThan(0);
    expect(launchAt(8000).guest).toBeLessThan(1);
    expect(launchAt(8300).guest).toBe(1);
    expect(launchAt(LAUNCH_LOOP_MS)).toEqual(launchAt(0));
    expect(arrivalAt(0, 0, LAUNCH_LOOP_MS + 100)).toBe(0);
  });

  // La souris paraît avant son clic et s'en va juste après : les dessins arrivent sans elle
  it("shows the mouse before the click and sends it away right after, before the first drawing", () => {
    expect(launchAt(0).pointer.opacity).toBe(0);
    expect(launchAt(1000).pointer.opacity).toBe(1);
    expect(launchAt(2200).pointer.opacity).toBeGreaterThan(0);
    expect(launchAt(2200).pointer.opacity).toBeLessThan(1);
    expect(launchAt(ARRIVALS[0]?.startMs ?? 0).pointer.opacity).toBe(0);
  });
});
