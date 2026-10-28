// Écart §14 (JOURNAL 2026-10-07) : la langue de la page, partagée par tous ceux qui l'affichent. Le serveur la rend
// d'après le cookie ou `Accept-Language` (`initial`) ; un choix écrit le cookie et change la page sans la recharger.
// Hors d'un `LocaleProvider` (un test, un composant seul), la langue est le français.

import { cookieValue } from "@liveplace/shared";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, localeCookie, toLocale } from "./locale";
import type { Localized } from "./texts";

type LocaleState = { locale: Locale; pick: (locale: Locale) => void };

const doNothing = (): void => undefined;

const LocaleContext = createContext<LocaleState>({ locale: DEFAULT_LOCALE, pick: doNothing });

export const writeLocaleCookie = (locale: Locale): void => {
  try {
    document.cookie = localeCookie(locale, window.location.protocol === "https:");
  } catch (error) {
    console.warn("use-locale : cookie refusé, la langue tient pour cette page seulement", error);
  }
};

export const getLocaleCookie = (): Locale | undefined => {
  try {
    return toLocale(cookieValue(document.cookie, LOCALE_COOKIE));
  } catch (error) {
    console.warn("use-locale : cookie illisible, la page garde sa langue", error);
    return undefined;
  }
};

// Le cookie fait foi : le HTML repris du cache au retour arrière, ou une page sortie du bfcache, date d'avant le dernier choix.
export const followLocaleCookie = (onLocale: (locale: Locale) => void): (() => void) => {
  const follow = () => {
    const stored = getLocaleCookie();
    if (stored) onLocale(stored);
  };
  follow();
  window.addEventListener("pageshow", follow);
  return () => window.removeEventListener("pageshow", follow);
};

export const LocaleProvider = ({ initial, children }: PropsWithChildren<{ initial: Locale }>) => {
  const [locale, setLocale] = useState(initial);
  useEffect(() => followLocaleCookie(setLocale), []);
  const pick = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    setLocale(next);
  }, []);
  const state = useMemo(() => ({ locale, pick }), [locale, pick]);
  return <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>;
};

// Une langue imposée à ce qui est dessous : la fenêtre Développeur reste en français (Écart §14).
export const FixedLocale = ({ locale, children }: PropsWithChildren<{ locale: Locale }>) => {
  const state = useMemo(() => ({ locale, pick: doNothing }), [locale]);
  return <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): Locale => useContext(LocaleContext).locale;

export const usePickLocale = (): ((locale: Locale) => void) => useContext(LocaleContext).pick;

// Les phrases d'un module dans la langue de la page : `const t = useTexts(MODERATION_TEXTS)`.
export const useTexts = <Texts,>(texts: Localized<Texts>): Texts => texts[useLocale()];
