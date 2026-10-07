// La section « Archives » de la fenêtre (Écart §15, JOURNAL 2026-10-06), pour le streamer seul : le canvas
// actif et ses archives, branchée sur les fonctions serveur. L'affichage est dans `canvas-cards.tsx` et `switch-window.tsx`.

import type { CanvasStore } from "../../state/canvas-store";
import { ArchivesSection } from "./canvas-cards";
import type { OwnSwitchTracker } from "./own-switch";
import { DiscardWindow, SwitchWindow } from "./switch-window";
import { useOwnerCanvases } from "./use-owner-canvases";

type ArchivesTabProps = { canvas: CanvasStore; login: string; tracker: OwnSwitchTracker };

export const ArchivesTab = ({ canvas, login, tracker }: ArchivesTabProps) => {
  const { section, switchWindow, discardWindow } = useOwnerCanvases(canvas, login, tracker);
  return (
    <>
      <ArchivesSection {...section} />
      <SwitchWindow {...switchWindow} />
      <DiscardWindow {...discardWindow} />
    </>
  );
};
