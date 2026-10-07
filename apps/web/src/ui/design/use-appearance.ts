// Le choix de l'apparence, partagé par tous ceux qui l'affichent (pill Compte, Mon compte, /design).
// Le script de `ScriptOnce` l'a déjà posé avant la peinture : ici, on le relit et on le change.

import { useSyncExternalStore } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  type AppearanceChoice,
  resolveAppearance,
  toAppearanceChoice,
} from "./appearance";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
let savedChoice: AppearanceChoice | null = null;

// Lu au premier accès, dans le navigateur seulement : `localStorage` n'existe pas sur le serveur.
const getSavedChoice = (): AppearanceChoice => {
  if (savedChoice) return savedChoice;
  try {
    savedChoice = toAppearanceChoice(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch (error) {
    console.warn("use-appearance : stockage refusé, apparence auto", error);
    savedChoice = "auto";
  }
  return savedChoice;
};

const applyAppearance = (): void => {
  const isSystemDark = window.matchMedia(SYSTEM_DARK_QUERY).matches;
  document.documentElement.dataset.appearance = resolveAppearance(getSavedChoice(), isSystemDark);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  // En auto, un changement d'apparence du système s'applique aussitôt (CDC 2026).
  const system = window.matchMedia(SYSTEM_DARK_QUERY);
  system.addEventListener("change", applyAppearance);
  return () => {
    listeners.delete(listener);
    system.removeEventListener("change", applyAppearance);
  };
};

// Le serveur ne connaît pas le choix : il rend `auto`, et React relit le vrai choix à l'hydratation.
const getServerChoice = (): AppearanceChoice => "auto";

export function pickAppearance(choice: AppearanceChoice): void {
  savedChoice = choice;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, choice);
  } catch (error) {
    console.warn("use-appearance : choix non retenu, stockage refusé", error);
  }
  applyAppearance();
  for (const listener of listeners) listener();
}

export function useAppearanceChoice(): AppearanceChoice {
  return useSyncExternalStore(subscribe, getSavedChoice, getServerChoice);
}
