// Choisir l'apparence : un bouton qui fait le cycle (pill Compte), ou les trois choix côte à côte (Mon compte, /design).

import { Moon, Sun, SunMoon } from "lucide-react";
import { type AppearanceChoice, nextAppearanceChoice } from "./appearance";
import { Button } from "./button";
import { Segmented, type SegmentedOption } from "./segmented";

const APPEARANCE_OPTIONS = [
  { value: "auto", label: "Auto", icon: SunMoon },
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
] as const satisfies readonly SegmentedOption<AppearanceChoice>[];

type AppearanceControlProps = { choice: AppearanceChoice; onPick: (choice: AppearanceChoice) => void };

export const AppearanceButton = ({ choice, onPick }: AppearanceControlProps) => {
  const { label, icon } = APPEARANCE_OPTIONS.find(({ value }) => value === choice) ?? APPEARANCE_OPTIONS[0];
  return (
    <Button
      icon={icon}
      variant="ghost"
      title={`Apparence : ${label}`}
      onPress={() => onPick(nextAppearanceChoice(choice))}
    />
  );
};

export const AppearancePicker = ({ choice, onPick }: AppearanceControlProps) => (
  <Segmented label="Apparence" options={APPEARANCE_OPTIONS} value={choice} onSelect={onPick} />
);
