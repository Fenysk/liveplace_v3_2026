// Écart §14 (JOURNAL 2026-10-07) : les phrases d'un module, chacune avec sa version dans chaque langue côte à côte.
// Une phrase sans une langue de `LOCALES` ne compile pas ; ajouter une langue, c'est ajouter sa clé à chaque phrase.

import { LOCALES, type Locale } from "./locale";

export type Localized<Value> = Record<Locale, Value>;

// Une phrase qui prend des valeurs (un nombre, un nom) : la version anglaise reprend les paramètres de la française,
// et rend une chaîne comme elle. Toute autre valeur (un tableau, une table de phrases) se type à la main : `localized<…>`.
export function localized<Args extends readonly unknown[]>(
  value: Localized<(...args: Args) => string>,
): Localized<(...args: Args) => string>;
export function localized<Value>(value: Localized<Value>): Localized<Value>;
export function localized(value: Localized<unknown>): Localized<unknown> {
  return value;
}

type Entries = Record<string, Localized<unknown>>;
type TextsOf<Phrases extends Entries> = { [Key in keyof Phrases]: Phrases[Key][Locale] };

const NO_BREAK_SPACE = "\u00a0";
const NARROW_NO_BREAK_SPACE = "\u202f";

// La typographie française : seule l'espace déjà écrite change. La ponctuation finit la chaîne ou précède une espace ou un guillemet
// fermant, sinon ce n'en est pas une (`!draw`, une adresse).
const FRENCH_SPACES: readonly (readonly [RegExp, string])[] = [
  [/ (?=[?!;](?=$|[\s»”)]))/g, NARROW_NO_BREAK_SPACE],
  [/ (?=:(?=$|[\s»”)]))/g, NO_BREAK_SPACE],
  [/(?<=«) /g, NO_BREAK_SPACE],
  [/ (?=»)/g, NO_BREAK_SPACE],
  [/(?<=\d) (?=(?:Mo|px|%|€)(?![\p{L}\d]))/gu, NO_BREAK_SPACE],
];

const withFrenchSpaces = (text: string): string =>
  FRENCH_SPACES.reduce((spaced, [pattern, space]) => spaced.replace(pattern, space), text);

const isFunction = (value: unknown): value is (...args: readonly unknown[]) => unknown =>
  typeof value === "function";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

// Une phrase française est une chaîne, une fonction qui rend une chaîne, ou une table ou un tableau de phrases ; le reste reste tel quel.
const spaceFrench = (phrase: unknown): unknown => {
  if (typeof phrase === "string") return withFrenchSpaces(phrase);
  if (isFunction(phrase))
    return (...args: readonly unknown[]) => {
      const text = phrase(...args);
      return typeof text === "string" ? withFrenchSpaces(text) : text;
    };
  if (Array.isArray(phrase)) return phrase.map((item) => spaceFrench(item));
  if (isPlainObject(phrase))
    return Object.fromEntries(Object.entries(phrase).map(([key, value]) => [key, spaceFrench(value)]));
  return phrase;
};

const read = <Phrases extends Entries>(phrases: Phrases, locale: Locale): TextsOf<Phrases> =>
  Object.fromEntries(
    Object.entries(phrases).map(([key, phrase]) => [
      key,
      locale === "fr" ? spaceFrench(phrase[locale]) : phrase[locale],
    ]),
  ) as TextsOf<Phrases>;

// Les phrases de chaque langue, prêtes à lire : `TEXTS.fr.close`, ou `useTexts(TEXTS)` dans un composant.
export const defineTexts = <Phrases extends Entries>(phrases: Phrases): Localized<TextsOf<Phrases>> =>
  Object.fromEntries(LOCALES.map((locale) => [locale, read(phrases, locale)])) as Localized<TextsOf<Phrases>>;
