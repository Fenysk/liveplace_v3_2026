// Écart §14 (JOURNAL 2026-10-07) : la langue de l'interface, `fr` ou `en`, retenue dans le cookie `lp_locale`.

import { cookieValue } from "@liveplace/shared";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "lp_locale";

const ONE_YEAR_S = 365 * 24 * 60 * 60;

// Chaque langue s'écrit dans sa propre langue : le choix se lit même quand on ne comprend pas la page.
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

// La balise de `Intl` de chaque langue : les nombres, les dates et les pluriels suivent.
export const INTL_TAGS: Record<Locale, string> = { fr: "fr-FR", en: "en-US" };

export const toLocale = (value: string | undefined): Locale | undefined =>
  LOCALES.find((locale) => locale === value);

// Le poids `q` d'une langue (RFC 9110) : 1 sans lui, et 0 veut dire « jamais cette langue ».
const weightOf = (parameters: readonly string[]): number => {
  const weight = parameters
    .map((parameter) => parameter.trim())
    .find((parameter) => parameter.startsWith("q="));
  return weight === undefined ? 1 : Number(weight.slice(2));
};

// La première langue connue, dans l'ordre des poids puis de l'en-tête ; la région est ignorée (`en-GB` est `en`).
const fromPreferenceHeader = (header: string | undefined): Locale | undefined => {
  let best: { locale: Locale; weight: number } | undefined;
  for (const entry of (header ?? "").split(",")) {
    const [tag = "", ...parameters] = entry.split(";");
    const locale = toLocale(tag.trim().split("-")[0]?.toLowerCase());
    const weight = weightOf(parameters);
    if (locale && weight > 0 && (!best || weight > best.weight)) best = { locale, weight };
  }
  return best?.locale;
};

type LocaleHeaders = { cookieHeader: string | undefined; preferenceHeader: string | undefined };

// Le cookie d'abord, puis `Accept-Language` (`preferenceHeader`), puis le français.
export const resolveLocale = ({ cookieHeader, preferenceHeader }: LocaleHeaders): Locale =>
  toLocale(cookieValue(cookieHeader, LOCALE_COOKIE)) ??
  fromPreferenceHeader(preferenceHeader) ??
  DEFAULT_LOCALE;

export const nextLocale = (locale: Locale): Locale =>
  LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length] ?? DEFAULT_LOCALE;

// Écrit par la page, donc sans `HttpOnly` : un cookie `HttpOnly` posé par `document.cookie` est ignoré.
export const localeCookie = (locale: Locale, isSecure: boolean): string =>
  [
    `${LOCALE_COOKIE}=${locale}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_S}`,
    "SameSite=Lax",
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");

export const formatNumber = (value: number, locale: Locale): string =>
  value.toLocaleString(INTL_TAGS[locale]);

// Le pluriel suit la règle de la langue : en français 0 et 1 sont au singulier, en anglais 1 seul.
export const isSingular = (count: number, locale: Locale): boolean =>
  new Intl.PluralRules(INTL_TAGS[locale]).select(count) === "one";
