// Le contenu de la section ouverte de la fenêtre Développeur, branché sur les stores : le suivi s'ouvre avec la section et se ferme
// avec elle. Capacité et Badges ont chacune leur lecture ; Cette fresque et Tout LivePlace partagent celle de l'activité.

import type { CanvasStore } from "../../state/canvas-store";
import type { DeveloperSectionId } from "./developer-window";
import { LiveActivitySection } from "./live-activity-section";
import { LiveBadgesSection } from "./live-badges-section";
import { LiveCapacitySection } from "./live-capacity-section";

type DeveloperContentProps = { canvas: CanvasStore; sectionId: DeveloperSectionId; isOpen: boolean };

export const DeveloperContent = ({ canvas, sectionId, isOpen }: DeveloperContentProps) => {
  if (sectionId === "capacity") return <LiveCapacitySection canvas={canvas} isOpen={isOpen} />;
  if (sectionId === "badges") return <LiveBadgesSection isOpen={isOpen} />;
  return <LiveActivitySection canvas={canvas} isOpen={isOpen} sectionId={sectionId} />;
};
