// Le choix du thème, partagé par tous ceux qui l'affichent (pill Compte, Préférences, /design).
// Le script de `ScriptOnce` l'a déjà posé avant la peinture : ici, on le relit et on le change.

import { useSyncExternalStore } from "react";
import { resolveTheme, THEME_STORAGE_KEY, type ThemeChoice, toThemeChoice } from "./theme";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
let savedChoice: ThemeChoice | null = null;

// Lu au premier accès, dans le navigateur seulement : `localStorage` n'existe pas sur le serveur.
const getSavedChoice = (): ThemeChoice => {
  if (savedChoice) return savedChoice;
  try {
    savedChoice = toThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch (error) {
    console.warn("use-theme : stockage refusé, thème auto", error);
    savedChoice = "auto";
  }
  return savedChoice;
};

const applyTheme = (): void => {
  const isSystemDark = window.matchMedia(SYSTEM_DARK_QUERY).matches;
  document.documentElement.dataset.theme = resolveTheme(getSavedChoice(), isSystemDark);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  // En auto, un changement de thème du système s'applique aussitôt (CDC 2026).
  const system = window.matchMedia(SYSTEM_DARK_QUERY);
  system.addEventListener("change", applyTheme);
  return () => {
    listeners.delete(listener);
    system.removeEventListener("change", applyTheme);
  };
};

// Le serveur ne connaît pas le choix : il rend `auto`, et React relit le vrai choix à l'hydratation.
const getServerChoice = (): ThemeChoice => "auto";

export function pickTheme(choice: ThemeChoice): void {
  savedChoice = choice;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch (error) {
    console.warn("use-theme : choix non retenu, stockage refusé", error);
  }
  applyTheme();
  for (const listener of listeners) listener();
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, getSavedChoice, getServerChoice);
}
