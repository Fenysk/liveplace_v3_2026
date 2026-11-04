// §9.9 : la langue de la page, partagée par tous ceux qui l'affichent. Le serveur la rend
// d'après le cookie ou `Accept-Language` (`initial`) ; un choix change la page sans la recharger, et le serveur le retient dans le
// cookie (`locale-request.ts`). Hors d'un `LocaleProvider` (un test, un composant seul), la langue est le français.

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { getSavedLocale, saveLocale } from "./locale-request";
import type { Localized } from "./texts";

type LocaleState = { locale: Locale; pick: (locale: Locale) => void };

const doNothing = (): void => undefined;

const LocaleContext = createContext<LocaleState>({ locale: DEFAULT_LOCALE, pick: doNothing });

// Un retour arrière peut reprendre le HTML du cache, rendu avant le dernier choix.
const isHistoryVisit = (): boolean => {
  const [entry] = performance.getEntriesByType("navigation");
  return entry !== undefined && "type" in entry && entry.type === "back_forward";
};

// Le cookie fait foi, et seul le serveur le lit : une page reprise du cache au retour arrière, ou sortie du bfcache, date d'avant le
// dernier choix. Une visite ordinaire n'interroge pas le serveur : son HTML vient d'être rendu d'après le cookie.
export const followSavedLocale = (onLocale: (locale: Locale) => void): (() => void) => {
  const follow = () => {
    void getSavedLocale().then((saved) => {
      if (saved) onLocale(saved);
    });
  };
  if (isHistoryVisit()) follow();
  const followRestoredPage = (event: PageTransitionEvent) => {
    if (event.persisted) follow();
  };
  window.addEventListener("pageshow", followRestoredPage);
  return () => window.removeEventListener("pageshow", followRestoredPage);
};

export const LocaleProvider = ({ initial, children }: PropsWithChildren<{ initial: Locale }>) => {
  const [locale, setLocale] = useState(initial);
  const hasPicked = useRef(false);
  // Un choix fait pendant que la réponse du serveur voyage l'emporte sur elle.
  useEffect(
    () =>
      followSavedLocale((saved) => {
        if (!hasPicked.current) setLocale(saved);
      }),
    [],
  );
  const pick = useCallback((next: Locale) => {
    hasPicked.current = true;
    setLocale(next);
    void saveLocale(next);
  }, []);
  const state = useMemo(() => ({ locale, pick }), [locale, pick]);
  return <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>;
};

// Une langue imposée à ce qui est dessous : la fenêtre Développeur reste en français (§9.9).
export const FixedLocale = ({ locale, children }: PropsWithChildren<{ locale: Locale }>) => {
  const state = useMemo(() => ({ locale, pick: doNothing }), [locale]);
  return <LocaleContext.Provider value={state}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): Locale => useContext(LocaleContext).locale;

export const usePickLocale = (): ((locale: Locale) => void) => useContext(LocaleContext).pick;

// Les phrases d'un module dans la langue de la page : `const t = useTexts(MODERATION_TEXTS)`.
export const useTexts = <Texts,>(texts: Localized<Texts>): Texts => texts[useLocale()];
