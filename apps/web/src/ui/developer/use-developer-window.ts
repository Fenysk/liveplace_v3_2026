// Le bouton Développeur et sa fenêtre (écart §10.3, JOURNAL 2026-10-06 et 2026-10-07) : le web les montre au compte
// connecté qui est le développeur ; le gateway, lui, décide d'envoyer ou non. La fenêtre s'ouvre sur Ce canvas, et le choix
// d'une section ne la ferme pas.

import { isDeveloper } from "@liveplace/domain";
import { useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { type DeveloperSectionId, FIRST_DEVELOPER_SECTION } from "./developer-window";

export function useDeveloperWindow(canvas: CanvasStore) {
  const getUserId = () => canvas.getView().userId;
  const userId = useSyncExternalStore(canvas.subscribe, getUserId, getUserId);
  const [isOpen, setIsOpen] = useState(false);
  const [sectionId, setSectionId] = useState<DeveloperSectionId>(FIRST_DEVELOPER_SECTION);
  const isShown = isDeveloper(userId);
  const open = () => {
    setSectionId(FIRST_DEVELOPER_SECTION);
    setIsOpen(true);
  };
  return {
    onOpen: isShown ? open : undefined, // absent : pas de bouton
    isOpen: isShown && isOpen,
    sectionId,
    onSelect: setSectionId,
    onClose: () => setIsOpen(false),
  };
}
