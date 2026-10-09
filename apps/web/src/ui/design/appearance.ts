// L'apparence (CDC 2026), clair ou sombre : auto au premier chargement, puis le choix retenu dans le navigateur
// (JOURNAL 2026-09-24, renommée en 2026-10-07 : « thème » est celui du canvas).

export const APPEARANCE_CHOICES = ["auto", "light", "dark"] as const;
export type AppearanceChoice = (typeof APPEARANCE_CHOICES)[number];
export type Appearance = Exclude<AppearanceChoice, "auto">;

// La valeur garde son ancien mot : la changer ferait perdre son choix à chaque joueur.
export const APPEARANCE_STORAGE_KEY = "liveplace:theme";

export function toAppearanceChoice(saved: string | null): AppearanceChoice {
  return APPEARANCE_CHOICES.find((choice) => choice === saved) ?? "auto";
}

export function nextAppearanceChoice(choice: AppearanceChoice): AppearanceChoice {
  return APPEARANCE_CHOICES[(APPEARANCE_CHOICES.indexOf(choice) + 1) % APPEARANCE_CHOICES.length] ?? "auto";
}

export function resolveAppearance(choice: AppearanceChoice, isSystemDark: boolean): Appearance {
  if (choice !== "auto") return choice;
  return isSystemDark ? "dark" : "light";
}

// Émis dans le `<head>` par `ScriptOnce` : pose l'apparence avant la première peinture, là où React n'est pas encore là.
// Même règle que `toAppearanceChoice` et `resolveAppearance` : le test l'exécute contre elles.
export const APPEARANCE_SCRIPT = `var c=null;try{c=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)})}catch(e){}document.documentElement.dataset.appearance=c==="light"||c==="dark"?c:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"`;
