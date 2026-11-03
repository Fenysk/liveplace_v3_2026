import { describe, expect, it } from "vitest";
import {
  CLOSE_FROM_MS,
  CLOSE_TO_MS,
  ICON_SPOT,
  INSTALL_LOOP_MS,
  INSTALL_RESTING_MS,
  installAt,
  OPEN_FROM_MS,
  OPEN_TO_MS,
  TAP_ICON_MS,
} from "./install-motion";

describe("App mobile (vignette)", () => {
  // L'image fixe : l'appli ouverte en plein écran, aucun doigt ni appui
  it("rests on the app open on the whole screen, with no finger and no press", () => {
    const moment = installAt(INSTALL_RESTING_MS);

    expect(moment.open).toBe(1);
    expect(moment.pointer.opacity).toBe(0);
    expect(moment.tap).toBe(0);
    expect(moment.press).toBe(0);
  });

  // La boucle part de l'écran d'accueil, appli fermée
  it("starts on the home screen, with the app still an icon", () => {
    expect(installAt(0).open).toBe(0);
    expect(installAt(0).pointer.opacity).toBe(0);
  });

  // Le doigt est sur l'icône au moment de l'appui, qui l'enfonce ; l'appli ne s'ouvre qu'après l'appui
  it("puts the finger on the icon at the tap, and opens the app only after it", () => {
    const onTap = installAt(TAP_ICON_MS);

    expect([onTap.pointer.ax, onTap.pointer.ay]).toEqual([ICON_SPOT.ax, ICON_SPOT.ay]);
    expect(onTap.tap).toBe(1);
    expect(onTap.press).toBe(1);
    expect(onTap.pointer.opacity).toBe(1);
    expect(TAP_ICON_MS).toBeLessThan(OPEN_FROM_MS);
    expect(installAt(TAP_ICON_MS).open).toBe(0);
  });

  // L'appli grandit en une seconde ou moins : à mi-chemin elle n'est ni fermée ni ouverte
  it("grows the app from its icon to the whole screen", () => {
    const halfway = installAt((OPEN_FROM_MS + OPEN_TO_MS) / 2).open;

    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
    expect(installAt(OPEN_TO_MS).open).toBe(1);
    expect(OPEN_TO_MS - OPEN_FROM_MS).toBeLessThanOrEqual(1000);
  });

  // Le doigt est parti avant que l'appli ne remplisse l'écran
  it("lifts the finger before the app fills the screen", () => {
    expect(installAt(OPEN_TO_MS).pointer.opacity).toBe(0);
    expect(installAt(2000).pointer.opacity).toBeLessThan(1);
  });

  // Le doigt paraît en fondu avant l'appui, au bas du téléphone, et glisse jusqu'à l'icône
  it("brings the finger in from below the icon before the tap", () => {
    expect(installAt(1000).pointer.opacity).toBe(1);
    expect(installAt(300).pointer.ay).toBeGreaterThan(ICON_SPOT.ay);
    expect(installAt(300).pointer.ay).toBeGreaterThan(installAt(900).pointer.ay);
  });

  // L'appli reste ouverte le temps de se lire, puis se referme vers l'icône, et la boucle se referme sur elle-même
  it("keeps the app open to be read, then closes it into its icon, and closes the loop on itself", () => {
    expect(installAt(CLOSE_FROM_MS - 1).open).toBe(1);
    expect(installAt((CLOSE_FROM_MS + CLOSE_TO_MS) / 2).open).toBeGreaterThan(0);
    expect(installAt((CLOSE_FROM_MS + CLOSE_TO_MS) / 2).open).toBeLessThan(1);
    expect(installAt(CLOSE_TO_MS).open).toBe(0);
    expect(CLOSE_FROM_MS - OPEN_TO_MS).toBeGreaterThanOrEqual(3000);
    expect(installAt(INSTALL_LOOP_MS)).toEqual(installAt(0));
  });
});
