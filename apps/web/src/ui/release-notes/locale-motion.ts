// La vignette « Hello world! » : le choix de la langue du jeu (Français, English), celui de l'accueil et de Mon compte, au-dessus de la pill
// Dessin (la jauge et Dessiner). Une souris choisit English : les mots de la pill passent en anglais (« Dessiner » devient « Draw »), puis
// Français : ils reviennent. La vignette montre les deux langues quelle que soit celle de la page. Le français est la langue de départ,
// la boucle se referme sans saut. L'image fixe : English choisi, la pill en anglais, sans souris.

import type { Locale } from "../locale/locale";
import { CLICK_HALF_MS, click, loopTime, spanOut } from "./motion-math";
import { type PointerMoment, type PointerSpot, pointerOpacity, spotAlong } from "./pointer-motion";

export const LOCALE_LOOP_MS = 8400;
export const LOCALE_RESTING_MS = 3000;

export const START_LOCALE: Locale = "fr";

// Les choix de la souris, dans l'ordre, et l'instant de chaque clic.
export const CHOICES: readonly { locale: Locale; clickMs: number }[] = [
  { locale: "en", clickMs: 1500 },
  { locale: "fr", clickMs: 4500 },
];

const POINTER_APPEARS_FROM_MS = 250;
const POINTER_APPEARS_TO_MS = 400;
const FADE_OUT_FROM_MS = 5500;
const FADE_OUT_TO_MS = 5900;

// Où la pointe se pose : le choix est dans la pill ancrée en haut au centre (unités de pill).
const START_SPOT: PointerSpot = { ax: 92, ay: 44, bx: 0, by: 0 };
export const OPTION_SPOTS: Readonly<Record<Locale, PointerSpot>> = {
  fr: { ax: 56, ay: 8, bx: -12.6, by: 8 },
  en: { ax: 56, ay: 8, bx: 13.7, by: 8 },
};

const WAYPOINTS = [
  { atMs: POINTER_APPEARS_FROM_MS, spot: START_SPOT },
  ...CHOICES.flatMap(({ locale, clickMs }) => [
    { atMs: clickMs - 120, spot: OPTION_SPOTS[locale] },
    { atMs: clickMs + 120, spot: OPTION_SPOTS[locale] },
  ]),
];

export type LocaleMoment = {
  chosen: Locale; // la langue choisie : celle de l'option sélectionnée et des mots de la pill
  taps: Readonly<Record<Locale, number>>; // l'appui sur chaque option, de 0 à 1
  pointer: PointerMoment;
  press: number; // la souris qui s'enfonce à chaque clic
};

// La langue du dernier choix déjà fait à l'instant `t` (après son clic), ou celle du départ.
const chosenAt = (t: number): Locale =>
  CHOICES.findLast(({ clickMs }) => t >= clickMs + CLICK_HALF_MS)?.locale ?? START_LOCALE;

const tapOf = (locale: Locale, t: number): number =>
  Math.max(
    0,
    ...CHOICES.filter((choice) => choice.locale === locale).map(({ clickMs }) => click(t, clickMs)),
  );

export const localeAt = (timeMs: number): LocaleMoment => {
  const t = loopTime(timeMs, LOCALE_LOOP_MS);
  const taps = { fr: tapOf("fr", t), en: tapOf("en", t) };
  return {
    chosen: chosenAt(t),
    taps,
    pointer: {
      ...spotAlong(WAYPOINTS, t),
      opacity: pointerOpacity(
        t,
        POINTER_APPEARS_FROM_MS,
        POINTER_APPEARS_TO_MS,
        spanOut(t, FADE_OUT_FROM_MS, FADE_OUT_TO_MS),
      ),
    },
    press: Math.max(...Object.values(taps)),
  };
};
