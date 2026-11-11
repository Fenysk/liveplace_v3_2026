// Le bouton du GIF timelapse (JOURNAL 2026-11-11) : une icône seule, pour le développeur. Son titre est du français voulu, comme la
// fenêtre Développeur : il vit ici, dans le dossier que le test des textes en dur laisse.

import { Clapperboard } from "lucide-react";
import { Button } from "../design/button";
import { TIMELAPSE_TEXTS } from "./timelapse-summary";

export const TimelapseButton = ({ onPress }: { onPress: () => void }) => (
  <Button icon={Clapperboard} variant="ghost" title={TIMELAPSE_TEXTS.button} onPress={onPress} />
);
