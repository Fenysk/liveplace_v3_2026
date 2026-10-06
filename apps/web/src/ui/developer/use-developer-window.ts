// Le bouton Développeur et sa fenêtre (écart §10.3, JOURNAL 2026-10-06) : le web les montre au compte connecté qui est
// le développeur ; le gateway, lui, décide d'envoyer ou non.

import { isDeveloper } from "@liveplace/domain";
import { useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";

export function useDeveloperWindow(canvas: CanvasStore) {
  const getUserId = () => canvas.getView().userId;
  const userId = useSyncExternalStore(canvas.subscribe, getUserId, getUserId);
  const [isOpen, setIsOpen] = useState(false);
  const isShown = isDeveloper(userId);
  return {
    onOpen: isShown ? () => setIsOpen(true) : undefined, // absent : pas de bouton
    isOpen: isShown && isOpen,
    onClose: () => setIsOpen(false),
  };
}
