// Le script AdSense Display (JOURNAL 2026-10-04) : chargé une seule fois par page, après consentement, en NPA.

import { ADSENSE_CLIENT } from "./adsense";

export const ADSENSE_SLOT_MOBILE = "7873218133";
export const ADSENSE_SLOT_DESKTOP = "2916404929";
const ADSENSE_SCRIPT_BASE = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const ADSENSE_SCRIPT_SRC = `${ADSENSE_SCRIPT_BASE}?client=${ADSENSE_CLIENT}`;

export type AdsByGoogleQueue = unknown[] & { requestNonPersonalizedAds?: number };

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
  }
}

// Ce que le chargeur demande à la page : le DOM n'entre que par là.
export type ScriptHost = {
  hasScript(): boolean;
  addScript(src: string, onLoad: () => void, onError: () => void): void;
  queue(): AdsByGoogleQueue;
};

export type AdSenseLoader = { ensureScript(): Promise<void>; pushSlot(): void };

export function createAdSenseLoader(host: ScriptHost): AdSenseLoader {
  let loading: Promise<void> | null = null;
  const markNonPersonalized = () => {
    host.queue().requestNonPersonalizedAds = 1;
  };
  return {
    // Le script se charge une fois, puis les pubs sont forcées non personnalisées.
    ensureScript() {
      if (loading) return loading;
      const attempt = new Promise<void>((resolve, reject) => {
        if (host.hasScript()) {
          markNonPersonalized();
          resolve();
          return;
        }
        host.addScript(
          ADSENSE_SCRIPT_SRC,
          () => {
            markNonPersonalized();
            resolve();
          },
          () => reject(new Error("AdSense script failed to load")),
        );
      });
      loading = attempt;
      // Un échec libère la place pour un nouvel essai ; l'appelant reçoit toujours le rejet de `attempt`.
      attempt.catch(() => {
        if (loading === attempt) loading = null;
      });
      return attempt;
    },
    pushSlot() {
      host.queue().push({});
    },
  };
}

const browserHost: ScriptHost = {
  hasScript: () => document.querySelector(`script[src^="${ADSENSE_SCRIPT_BASE}"]`) !== null,
  addScript(src, onLoad, onError) {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = onLoad;
    script.onerror = onError;
    document.head.appendChild(script);
  },
  queue() {
    window.adsbygoogle ??= [];
    return window.adsbygoogle;
  },
};

let browserLoader: AdSenseLoader | undefined;

// Créé au premier appel : `document` n'existe pas sur le serveur.
export const getAdSenseLoader = (): AdSenseLoader => {
  browserLoader ??= createAdSenseLoader(browserHost);
  return browserLoader;
};
