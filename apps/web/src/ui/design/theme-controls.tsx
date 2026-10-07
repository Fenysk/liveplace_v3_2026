// Choisir le thème : un bouton qui fait le cycle (pill Compte), ou les trois choix côte à côte (Mon compte, /design).

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTexts } from "../locale/use-locale";
import { Button } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Segmented, type SegmentedOption } from "./segmented";
import { nextThemeChoice, type ThemeChoice } from "./theme";

type ThemeControlProps = { choice: ThemeChoice; onPick: (choice: ThemeChoice) => void };

const useThemeOptions = () => {
  const t = useTexts(DESIGN_TEXTS);
  return [
    { value: "auto", label: t.themeAuto, icon: SunMoon },
    { value: "light", label: t.themeLight, icon: Sun },
    { value: "dark", label: t.themeDark, icon: Moon },
  ] as const satisfies readonly SegmentedOption<ThemeChoice>[];
};

export const ThemeButton = ({ choice, onPick }: ThemeControlProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const options = useThemeOptions();
  const { label, icon } = options.find(({ value }) => value === choice) ?? options[0];
  return (
    <Button
      icon={icon}
      variant="ghost"
      title={t.themeTip(label)}
      onPress={() => onPick(nextThemeChoice(choice))}
    />
  );
};

export const ThemePicker = ({ choice, onPick }: ThemeControlProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const options = useThemeOptions();
  return <Segmented label={t.theme} options={options} value={choice} onSelect={onPick} />;
};
