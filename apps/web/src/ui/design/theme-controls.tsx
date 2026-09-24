// Choisir le thème : un bouton qui fait le cycle (pill Compte), ou les trois choix côte à côte (Préférences, /design).

import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "./button";
import { Segmented, type SegmentedOption } from "./segmented";
import { nextThemeChoice, type ThemeChoice } from "./theme";

const THEME_OPTIONS = [
  { value: "auto", label: "Auto", icon: SunMoon },
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
] as const satisfies readonly SegmentedOption<ThemeChoice>[];

type ThemeControlProps = { choice: ThemeChoice; onPick: (choice: ThemeChoice) => void };

export const ThemeButton = ({ choice, onPick }: ThemeControlProps) => {
  const { label, icon } = THEME_OPTIONS.find(({ value }) => value === choice) ?? THEME_OPTIONS[0];
  return (
    <Button
      icon={icon}
      variant="ghost"
      title={`Thème : ${label}`}
      onPress={() => onPick(nextThemeChoice(choice))}
    />
  );
};

export const ThemePicker = ({ choice, onPick }: ThemeControlProps) => (
  <Segmented label="Thème" options={THEME_OPTIONS} value={choice} onSelect={onPick} />
);
