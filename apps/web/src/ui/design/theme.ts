// Le thème (CDC 2026) : auto au premier chargement, puis le choix retenu dans le navigateur (JOURNAL 2026-09-24).

export const THEME_CHOICES = ["auto", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = Exclude<ThemeChoice, "auto">;

export const THEME_STORAGE_KEY = "liveplace:theme";

export function toThemeChoice(saved: string | null): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === saved) ?? "auto";
}

export function nextThemeChoice(choice: ThemeChoice): ThemeChoice {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length] ?? "auto";
}

export function resolveTheme(choice: ThemeChoice, isSystemDark: boolean): Theme {
  if (choice !== "auto") return choice;
  return isSystemDark ? "dark" : "light";
}

// Émis dans le `<head>` par `ScriptOnce` : pose le thème avant la première peinture, là où React n'est pas encore là.
// Même règle que `toThemeChoice` et `resolveTheme` : le test l'exécute contre elles.
export const THEME_SCRIPT = `var c=null;try{c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}document.documentElement.dataset.theme=c==="light"||c==="dark"?c:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"`;
