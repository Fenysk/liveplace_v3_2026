// Écart §5.3 (JOURNAL 2026-10-24) : des pixels ont changé de case. Une demande ouverte (signaler, retirer) visait un x, y d'avant,
// et l'aperçu de sa fenêtre montre des positions fausses : elle se ferme, aucune action ne part avec une case périmée.
// Écart §5.3 (JOURNAL 2026-10-28) : un décalage de la fresque aussi (`toMoveKey`).

import { useEffect, useRef } from "react";

// `isOpen` à faux : rien à fermer, ou une action en cours qu'on laisse finir.
export function useCloseOnMove(moveKey: string, isOpen: boolean, close: () => void): void {
  const seen = useRef(moveKey);
  useEffect(() => {
    const hasMoved = seen.current !== moveKey;
    seen.current = moveKey;
    if (hasMoved && isOpen) close();
  }, [moveKey, isOpen, close]);
}
