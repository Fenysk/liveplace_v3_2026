// Le choix du jour en tête de Cette fresque et de Tout LivePlace (JOURNAL 2026-10-14) : « ‹ date › ». Les deux flèches sont de
// vrais boutons, au clavier comme à la souris ; elles se désactivent sur aujourd'hui et sur le plus ancien jour gardé.

import type { Timestamp } from "@liveplace/domain";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../design/button";
import type { DayChoice } from "./day-choice";

type DaySwitchProps = {
  choice: DayChoice;
  onSelect: (dayAt: Timestamp | undefined) => void; // `undefined` : aujourd'hui
};

export const DaySwitch = ({ choice, onSelect }: DaySwitchProps) => (
  <div className="lp-day-switch">
    <Button
      icon={ChevronLeft}
      variant="ghost"
      title="Jour précédent"
      isDisabled={!choice.canGoBack}
      onPress={() => onSelect(choice.previousAt)}
    />
    {/* Le texte change sans bouger les flèches : sa largeur est fixe, et un lecteur d'écran l'annonce. */}
    <span className="lp-day-switch-label lp-type-title" aria-live="polite">
      {choice.label}
    </span>
    <Button
      icon={ChevronRight}
      variant="ghost"
      title="Jour suivant"
      isDisabled={!choice.canGoForward}
      onPress={() => onSelect(choice.nextAt)}
    />
  </div>
);
