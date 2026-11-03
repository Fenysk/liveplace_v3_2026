import { describe, expect, it } from "vitest";
import {
  CHOICES,
  LOCALE_LOOP_MS,
  LOCALE_RESTING_MS,
  localeAt,
  OPTION_SPOTS,
  START_LOCALE,
} from "./locale-motion";

describe("Hello world! (vignette)", () => {
  // L'image fixe : English choisi, aucun appui (la souris est cachée par le CSS en mouvement réduit)
  it("rests on English chosen, with no press", () => {
    const moment = localeAt(LOCALE_RESTING_MS);

    expect(moment.chosen).toBe("en");
    expect(moment.taps).toEqual({ fr: 0, en: 0 });
  });

  // Le français est la langue de départ, et le premier choix est l'autre : la boucle a quelque chose à montrer
  it("starts in French, and the first choice is English", () => {
    expect(START_LOCALE).toBe("fr");
    expect(CHOICES[0]?.locale).toBe("en");
    expect(localeAt(0).chosen).toBe("fr");
  });

  // La langue ne change qu'après le clic de la souris, pas avant
  it("changes the language right after each click, not before", () => {
    for (const { locale, clickMs } of CHOICES) {
      expect(localeAt(clickMs - 100).chosen).not.toBe(locale);
      expect(localeAt(clickMs).chosen).not.toBe(locale);
      expect(localeAt(clickMs + 100).chosen).toBe(locale);
    }
  });

  // La pointe tombe sur l'option au clic, qui l'enfonce, et sur elle seule
  it("puts the tip on the option at each click, and presses that option only", () => {
    for (const { locale, clickMs } of CHOICES) {
      const moment = localeAt(clickMs);
      const spot = OPTION_SPOTS[locale];

      expect([moment.pointer.ax, moment.pointer.ay, moment.pointer.bx, moment.pointer.by]).toEqual([
        spot.ax,
        spot.ay,
        spot.bx,
        spot.by,
      ]);
      expect(moment.taps[locale]).toBe(1);
      expect(moment.taps[locale === "fr" ? "en" : "fr"]).toBe(0);
      expect(moment.press).toBe(1);
    }
  });

  // La vignette montre les deux langues, dans l'ordre : English d'abord, puis le retour au français
  it("shows both languages in turn, English and then French again", () => {
    const seen = new Set<string>();
    for (let t = 0; t < LOCALE_LOOP_MS; t += 100) seen.add(localeAt(t).chosen);

    expect([...seen].sort()).toEqual(["en", "fr"]);
    expect(localeAt(3000).chosen).toBe("en");
    expect(localeAt(5000).chosen).toBe("fr");
  });

  // La souris part en fondu après le dernier clic, et la boucle se referme sur elle-même, en français comme au départ
  it("lets the mouse fade out after the last click, and closes the loop on itself", () => {
    expect(localeAt(5700).pointer.opacity).toBeGreaterThan(0);
    expect(localeAt(5700).pointer.opacity).toBeLessThan(1);
    expect(localeAt(6000).pointer.opacity).toBe(0);
    expect(localeAt(LOCALE_LOOP_MS - 1).chosen).toBe(START_LOCALE);
    expect(localeAt(LOCALE_LOOP_MS)).toEqual(localeAt(0));
  });
});
