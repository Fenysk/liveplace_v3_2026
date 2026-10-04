import { useSyncExternalStore } from "react";
import { type AdConsent, type AdConsentReading, getAdConsent, writeAdConsent } from "./ad-consent";

const listeners = new Set<() => void>();
// Stockage refusé : le choix ne vit que le temps de la page.
let unsavedChoice: AdConsent | null = null;

// Lu à chaque accès : dans une fenêtre qui refuse le stockage, l'accès lui-même lève.
const getStoredConsent = (): AdConsent | null => {
  try {
    return getAdConsent(window.localStorage);
  } catch (error) {
    console.warn("ad-consent : stockage illisible, aucun choix", error);
    return null;
  }
};

const getConsent = (): AdConsent | "unset" => unsavedChoice ?? getStoredConsent() ?? "unset";

// `storage` : un autre onglet a changé le choix. Le même onglet prévient lui-même (`choose`).
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

const choose = (choice: AdConsent) => {
  try {
    writeAdConsent(choice, window.localStorage);
    unsavedChoice = null;
  } catch (error) {
    console.warn("ad-consent : choix non enregistré, retenu le temps de la page", error);
    unsavedChoice = choice;
  }
  for (const listener of listeners) listener();
};

const accept = () => choose("accepted");
const refuse = () => choose("refused");

// Le serveur ne connaît pas le choix : il rend `null`, puis React relit après l'hydratation.
export function useAdConsent(): { consent: AdConsentReading; accept: () => void; refuse: () => void } {
  const consent = useSyncExternalStore<AdConsentReading>(subscribe, getConsent, () => null);
  return { consent, accept, refuse };
}
