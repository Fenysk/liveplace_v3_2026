import { describe, expect, it } from "vitest";
import {
  ENTER_SPOT,
  LIVE_FROM_MS,
  LIVE_ONLY_LOOP_MS,
  LIVE_ONLY_RESTING_MS,
  LIVE_TO_MS,
  liveOnlyAt,
  PRESS_ENTER_MS,
} from "./live-only-motion";

const spotOf = ({ ax, ay, bx, by }: { ax: number; ay: number; bx: number; by: number }) => [ax, ay, bx, by];

describe("Dessin pendant tes lives (vignette)", () => {
  // L'image fixe : hors live, Dessiner grisé, le toast visible, le bouton Twitch gris, sans souris
  it("rests out of the live: Dessiner greyed, the toast shown, the Twitch button grey, no mouse", () => {
    const moment = liveOnlyAt(LIVE_ONLY_RESTING_MS);

    expect(moment.pills).toBe(1);
    expect(moment.isGreyed).toBe(true);
    expect(moment.toast).toBe(1);
    expect(moment.live).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.press).toBe(0);
  });

  // La boucle part de rien : les pills effacées, hors live, Dessiner grisé, pas de toast
  it("starts from nothing: pills faded out, out of the live, Dessiner greyed, no toast", () => {
    const moment = liveOnlyAt(0);

    expect(moment.pills).toBe(0);
    expect(moment.isGreyed).toBe(true);
    expect(moment.live).toBe(0);
    expect(moment.toast).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
  });

  // La souris appuie sur Dessiner grisé, qui s'enfonce ; il reste grisé
  it("presses the greyed Dessiner with the mouse, which stays greyed", () => {
    const moment = liveOnlyAt(PRESS_ENTER_MS);

    expect(spotOf(moment.pointer)).toEqual(spotOf(ENTER_SPOT));
    expect(moment.pointer.opacity).toBe(1);
    expect(moment.press).toBe(1);
    expect(moment.isGreyed).toBe(true);
    expect(liveOnlyAt(PRESS_ENTER_MS - 300).press).toBe(0);
  });

  // Le toast paraît juste après l'appui, reste environ deux secondes, puis disparaît
  it("shows the toast right after the press, keeps it about two seconds, then takes it away", () => {
    expect(liveOnlyAt(PRESS_ENTER_MS).toast).toBeLessThan(0.5);
    expect(liveOnlyAt(1400).toast).toBe(1);
    expect(liveOnlyAt(2900).toast).toBe(1);
    expect(liveOnlyAt(3120).toast).toBeGreaterThan(0);
    expect(liveOnlyAt(3120).toast).toBeLessThan(1);
    expect(liveOnlyAt(3400).toast).toBe(0);
    const shown = [...Array(120).keys()].filter((step) => liveOnlyAt(step * 50).toast > 0.5).length * 50;
    expect(shown).toBeGreaterThanOrEqual(1800);
    expect(shown).toBeLessThanOrEqual(2200);
  });

  // La souris s'en va avant le live : elle ne se pose jamais sur le profil
  it("takes the mouse away before the live starts", () => {
    expect(liveOnlyAt(1650).pointer.opacity).toBeGreaterThan(0);
    expect(liveOnlyAt(1650).pointer.opacity).toBeLessThan(1);
    expect(liveOnlyAt(2000).pointer.opacity).toBe(0);
  });

  // Le live démarre une fois le toast parti : le bouton Twitch passe en live et Dessiner redevient plein, au même moment
  it("starts the live once the toast is gone: the Twitch button goes live and Dessiner turns full", () => {
    expect(liveOnlyAt(LIVE_FROM_MS - 1).isGreyed).toBe(true);
    expect(liveOnlyAt(LIVE_FROM_MS - 1).live).toBe(0);
    expect(liveOnlyAt(LIVE_FROM_MS).toast).toBe(0);
    const going = liveOnlyAt((LIVE_FROM_MS + LIVE_TO_MS) / 2).live;
    expect(going).toBeGreaterThan(0);
    expect(going).toBeLessThan(1);
    const live = liveOnlyAt(LIVE_TO_MS + 200);
    expect(live.live).toBe(1);
    expect(live.isGreyed).toBe(false);
    expect(live.pills).toBe(1);
  });

  // Tout s'efface en fondu avant la fin, et le retour au grisé se fait pills effacées : la boucle se referme sans saut visible
  it("fades everything out before the end, going back to greyed with the pills gone, so the loop closes without a jump", () => {
    const fading = liveOnlyAt(5500);
    expect(fading.pills).toBeGreaterThan(0);
    expect(fading.pills).toBeLessThan(1);
    expect(fading.live).toBeLessThan(1);
    expect(liveOnlyAt(5700).pills).toBe(0);
    expect(liveOnlyAt(5700).isGreyed).toBe(true);
    expect(liveOnlyAt(LIVE_ONLY_LOOP_MS - 1).pills).toBe(0);
    expect(liveOnlyAt(LIVE_ONLY_LOOP_MS)).toEqual(liveOnlyAt(0));
    expect(liveOnlyAt(LIVE_ONLY_LOOP_MS + LIVE_ONLY_RESTING_MS)).toEqual(liveOnlyAt(LIVE_ONLY_RESTING_MS));
  });

  // Une boucle d'environ six secondes
  it("loops in about six seconds", () => {
    expect(LIVE_ONLY_LOOP_MS).toBe(6000);
  });
});
