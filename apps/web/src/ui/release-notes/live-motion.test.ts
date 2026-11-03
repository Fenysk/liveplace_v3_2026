import { describe, expect, it } from "vitest";
import { CAT_LAYERS } from "./inspection-scene";
import {
  CELL_SPOT,
  CLICK_CELL_MS,
  LIVE_CELL,
  LIVE_COLOR_INDEX,
  LIVE_FROM_MS,
  LIVE_LOOP_MS,
  LIVE_RESTING_MS,
  LIVE_TO_MS,
  liveAt,
} from "./live-motion";

describe("En live sur Twitch (vignette)", () => {
  // L'image fixe : la pill ouverte, la case entourée, le bouton Twitch en live avec sa catégorie, aucune souris
  it("rests on the Inspection pill open, the cell ringed and the Twitch button live, with no mouse", () => {
    const moment = liveAt(LIVE_RESTING_MS);

    expect(moment.pill).toBe(1);
    expect(moment.ring).toBe(1);
    expect(moment.live).toBe(1);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.press).toBe(0);
  });

  // La boucle part de la fresque seule : ni pill, ni contour, le bouton n'est pas encore en live
  it("starts on the canvas alone, with nothing open and the button not yet live", () => {
    const moment = liveAt(0);

    expect([moment.pill, moment.ring, moment.live]).toEqual([0, 0, 0]);
  });

  // La pointe tombe sur la case au clic, qui l'enfonce ; la pill ne s'ouvre qu'après le clic
  it("puts the tip on the cell at the click, and opens the pill only after it", () => {
    const onClick = liveAt(CLICK_CELL_MS);

    expect([onClick.pointer.ax, onClick.pointer.ay]).toEqual([CELL_SPOT.ax, CELL_SPOT.ay]);
    expect(onClick.press).toBe(1);
    expect(onClick.pill).toBe(0);
    expect(liveAt(CLICK_CELL_MS + 600).pill).toBe(1);
  });

  // Le bouton ne passe en live qu'une fois la pill ouverte et la souris partie : à mi-chemin il est entre les deux états
  it("turns the button live only once the pill is open and the mouse gone, crossing between the two states", () => {
    expect(liveAt(LIVE_FROM_MS - 1).live).toBe(0);
    expect(liveAt(LIVE_FROM_MS - 1).pill).toBe(1);
    expect(liveAt(LIVE_FROM_MS - 1).pointer.opacity).toBe(0);
    expect(liveAt((LIVE_FROM_MS + LIVE_TO_MS) / 2).live).toBeGreaterThan(0);
    expect(liveAt((LIVE_FROM_MS + LIVE_TO_MS) / 2).live).toBeLessThan(1);
    expect(liveAt(LIVE_TO_MS).live).toBe(1);
  });

  // La case cliquée est bien un pixel du chat, et sa couleur celle que la pill donne
  it("clicks a real cell of the cat, and names its color", () => {
    const orange = CAT_LAYERS.find((layer) => layer.colorIndex === LIVE_COLOR_INDEX);

    expect(orange?.cells.some(([x, y]) => x === LIVE_CELL.x && y === LIVE_CELL.y)).toBe(true);
  });

  // Tout part en fondu avant que la boucle reparte, et la boucle se referme sur elle-même
  it("fades everything out, and closes the loop on itself", () => {
    expect(liveAt(7550).pill).toBeGreaterThan(0);
    expect(liveAt(7550).pill).toBeLessThan(1);
    expect(liveAt(7900).pill).toBe(0);
    expect(liveAt(7900).live).toBe(0);
    expect(liveAt(LIVE_LOOP_MS)).toEqual(liveAt(0));
  });

  // La souris paraît avant son clic et s'en va avant que le bouton ne passe en live
  it("shows the mouse before the click and sends it away before the button turns live", () => {
    expect(liveAt(0).pointer.opacity).toBe(0);
    expect(liveAt(1000).pointer.opacity).toBe(1);
    expect(liveAt(2300).pointer.opacity).toBeGreaterThan(0);
    expect(liveAt(2300).pointer.opacity).toBeLessThan(1);
    expect(liveAt(LIVE_FROM_MS).pointer.opacity).toBe(0);
  });
});
