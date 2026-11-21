// La section Événement de la fenêtre (JOURNAL 2026-11-21), pour le streamer : le thème de la fresque, puis l'événement Streamlabs Charity
// (seulement sur sa propre fresque : ailleurs, le thème reste seul).

import type { CanvasStore } from "../../state/canvas-store";
import { CharitySection } from "../charity/charity-section";
import { useCharityEvent } from "../charity/use-charity-event";
import { ThemeSettings } from "./canvas-settings";
import { useThemeField } from "./use-theme-field";

export const EventTab = ({ canvas }: { canvas: CanvasStore }) => {
  const theme = useThemeField();
  const charity = useCharityEvent(canvas);
  return (
    <>
      <ThemeSettings theme={theme} />
      {charity && <CharitySection {...charity} />}
    </>
  );
};
