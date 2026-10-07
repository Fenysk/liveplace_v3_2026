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

const read = <Phrases extends Entries>(phrases: Phrases, locale: Locale): TextsOf<Phrases> =>
  Object.fromEntries(
    Object.entries(phrases).map(([key, phrase]) => [key, phrase[locale]]),
  ) as TextsOf<Phrases>;

// Les phrases de chaque langue, prêtes à lire : `TEXTS.fr.close`, ou `useTexts(TEXTS)` dans un composant.
export const defineTexts = <Phrases extends Entries>(phrases: Phrases): Localized<TextsOf<Phrases>> =>
  Object.fromEntries(LOCALES.map((locale) => [locale, read(phrases, locale)])) as Localized<TextsOf<Phrases>>;
