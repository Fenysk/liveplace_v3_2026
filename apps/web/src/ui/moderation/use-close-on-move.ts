// Écart §5.3 (JOURNAL 2026-10-24) : des pixels ont changé de case. Une demande ouverte (signaler, retirer) visait un x, y d'avant,
// et l'aperçu de sa fenêtre montre des positions fausses : elle se ferme, aucune action ne part avec une case périmée.

import { useEffect, useRef } from "react";

// `isOpen` à faux : rien à fermer, ou une action en cours qu'on laisse finir.
export function useCloseOnMove(movedAtVersion: number | undefined, isOpen: boolean, close: () => void): void {
  const seen = useRef(movedAtVersion);
  useEffect(() => {
    const hasMoved = seen.current !== movedAtVersion;
    seen.current = movedAtVersion;
    if (hasMoved && isOpen) close();
  }, [movedAtVersion, isOpen, close]);
}
