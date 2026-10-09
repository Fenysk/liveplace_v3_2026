// Choisir l'apparence : un bouton qui fait le cycle (pill Compte), ou les trois choix côte à côte (Mon compte, /design).

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTexts } from "../locale/use-locale";
import { type AppearanceChoice, nextAppearanceChoice } from "./appearance";
import { Button } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Segmented, type SegmentedOption } from "./segmented";

type AppearanceControlProps = { choice: AppearanceChoice; onPick: (choice: AppearanceChoice) => void };

const useAppearanceOptions = () => {
  const t = useTexts(DESIGN_TEXTS);
  return [
    { value: "auto", label: t.appearanceAuto, icon: SunMoon },
    { value: "light", label: t.appearanceLight, icon: Sun },
    { value: "dark", label: t.appearanceDark, icon: Moon },
  ] as const satisfies readonly SegmentedOption<AppearanceChoice>[];
};

export const AppearanceButton = ({ choice, onPick }: AppearanceControlProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const options = useAppearanceOptions();
  const { label, icon } = options.find(({ value }) => value === choice) ?? options[0];
  return (
    <Button
      icon={icon}
      variant="ghost"
      title={t.appearanceTip(label)}
      onPress={() => onPick(nextAppearanceChoice(choice))}
    />
  );
};

export const AppearancePicker = ({ choice, onPick }: AppearanceControlProps) => {
  const t = useTexts(DESIGN_TEXTS);
  const options = useAppearanceOptions();
  return <Segmented label={t.appearance} options={options} value={choice} onSelect={onPick} />;
};
