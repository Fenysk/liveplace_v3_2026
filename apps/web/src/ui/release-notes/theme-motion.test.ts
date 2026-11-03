import { describe, expect, it } from "vitest";
import {
  AWAY_SPOT,
  CLICK_AWAY_MS,
  CLICK_FIELD_MS,
  FIELD_SPOT,
  THEME_LOOP_MS,
  THEME_RESTING_MS,
  TYPING_FROM_MS,
  TYPING_TO_MS,
  themeAt,
} from "./theme-motion";

const spotOf = ({ ax, ay, bx, by }: { ax: number; ay: number; bx: number; by: number }) => [ax, ay, bx, by];

describe("Un thème pour la fresque (vignette)", () => {
  // L'image fixe : la pill Thème en haut, sans fenêtre, sans toast, sans souris, le champ enregistré et sans focus
  it("rests on the Theme pill alone, with no window, no toast, no mouse", () => {
    const moment = themeAt(THEME_RESTING_MS);

    expect(moment.pill).toBe(1);
    expect(moment.window).toBe(0);
    expect(moment.toast).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.press).toBe(0);
    expect(moment.isFocused).toBe(false);
    expect(moment.caret).toBe(0);
    expect(moment.typed).toBe(1);
  });

  // La boucle commence par la fresque seule : ni thème, ni fenêtre, rien d'écrit
  it("starts on the canvas alone: no theme yet, no window, nothing written", () => {
    const moment = themeAt(0);

    expect(moment.pill).toBe(0);
    expect(moment.window).toBe(0);
    expect(moment.typed).toBe(0);
    expect(moment.pointer.opacity).toBe(0);
  });

  // La souris clique le champ : il prend le focus ; rien n'est encore écrit
  it("puts the focus on the field when the mouse clicks it, with nothing written yet", () => {
    expect(themeAt(CLICK_FIELD_MS - 200).isFocused).toBe(false);
    const moment = themeAt(CLICK_FIELD_MS);

    expect(moment.isFocused).toBe(true);
    expect(moment.typed).toBe(0);
    expect(moment.press).toBe(1);
    expect(spotOf(moment.pointer)).toEqual(spotOf(FIELD_SPOT));
    expect(moment.window).toBe(1);
  });

  // Le thème s'écrit d'un bout à l'autre du temps d'écriture, du premier instant au dernier, sans reculer ; le curseur reste allumé
  it("writes the theme from the first to the last instant of the typing, never going back, the caret steady", () => {
    expect(themeAt(TYPING_FROM_MS).typed).toBe(0);
    expect(themeAt((TYPING_FROM_MS + TYPING_TO_MS) / 2).typed).toBeCloseTo(0.5, 5);
    expect(themeAt(TYPING_TO_MS).typed).toBe(1);
    let before = 0;
    for (let t = TYPING_FROM_MS; t <= TYPING_TO_MS; t += 50) {
      const moment = themeAt(t);

      expect(moment.typed).toBeGreaterThanOrEqual(before);
      expect(moment.isFocused).toBe(true);
      expect(moment.caret).toBe(1);
      before = moment.typed;
    }
  });

  // Une fois écrit, le curseur clignote tant que le champ a le focus
  it("blinks the caret once the typing is over, while the field keeps the focus", () => {
    const carets = [2800, 3000, 3200, 3400 - 1].map((t) => themeAt(t).caret);

    expect(new Set(carets)).toEqual(new Set([0, 1]));
  });

  // La souris clique à côté, sur la phrase d'aide : le champ perd le focus, c'est ce qui l'enregistre, et le toast le dit
  it("clicks beside the field, which loses the focus and saves the theme, the toast saying so", () => {
    expect(themeAt(CLICK_AWAY_MS - 100).isFocused).toBe(true);
    const moment = themeAt(CLICK_AWAY_MS);

    expect(spotOf(moment.pointer)).toEqual(spotOf(AWAY_SPOT));
    expect(moment.press).toBe(1);
    expect(moment.isFocused).toBe(false);
    expect(moment.caret).toBe(0);
    expect(moment.typed).toBe(1);
    expect(themeAt(CLICK_AWAY_MS + 80).toast).toBeLessThan(1);
    expect(themeAt(CLICK_AWAY_MS + 600).toast).toBe(1);
    expect(themeAt(CLICK_AWAY_MS - 100).toast).toBe(0);
  });

  // Les deux clics tombent sur des endroits différents : le champ, puis la phrase d'aide dessous
  it("clicks two different places: the field, then the help sentence under it", () => {
    expect(spotOf(FIELD_SPOT)).not.toEqual(spotOf(AWAY_SPOT));
    expect(AWAY_SPOT.by).toBeGreaterThan(FIELD_SPOT.by);
  });

  // La fenêtre se ferme, puis la pill Thème paraît : jamais les deux en même temps
  it("closes the window before the Theme pill appears", () => {
    expect(themeAt(4100).window).toBeGreaterThan(0);
    expect(themeAt(4100).window).toBeLessThan(1);
    expect(themeAt(4100).pill).toBe(0);
    expect(themeAt(4350).window).toBe(0);
    expect(themeAt(4550).pill).toBeGreaterThan(0);
    expect(themeAt(4550).pill).toBeLessThan(1);
    expect(themeAt(4800).pill).toBe(1);
  });

  // La souris paraît en fondu avant son premier trajet et s'efface avant que la fenêtre ne se ferme tout à fait
  it("fades the mouse in before it moves, and out before the window is gone", () => {
    expect(themeAt(300).pointer.opacity).toBe(0);
    expect(themeAt(520).pointer.opacity).toBeGreaterThan(0);
    expect(themeAt(520).pointer.opacity).toBeLessThan(1);
    expect(themeAt(CLICK_FIELD_MS).pointer.opacity).toBe(1);
    expect(themeAt(3850).pointer.opacity).toBeGreaterThan(0);
    expect(themeAt(3850).pointer.opacity).toBeLessThan(1);
    expect(themeAt(4400).pointer.opacity).toBe(0);
  });

  // Un temps de repos avec le thème en haut, puis la pill s'efface en fondu : la boucle repart de la fresque seule
  it("rests a few seconds on the theme, then fades it out so the loop starts again from the canvas alone", () => {
    expect(themeAt(8000).pill).toBe(1);
    expect(themeAt(8300).pill).toBeGreaterThan(0);
    expect(themeAt(8300).pill).toBeLessThan(1);
    expect(themeAt(8600).pill).toBe(0);
    expect(themeAt(THEME_LOOP_MS - 1).pill).toBe(0);
    expect(themeAt(THEME_LOOP_MS - 1).window).toBe(0);
    expect(themeAt(THEME_LOOP_MS)).toEqual(themeAt(0));
    expect(themeAt(THEME_LOOP_MS + THEME_RESTING_MS)).toEqual(themeAt(THEME_RESTING_MS));
  });
});
