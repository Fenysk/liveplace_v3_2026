// Copier le lien d'une archive (Écart §15, JOURNAL 2026-10-06) : l'adresse entière, puis le toast « Lien
// copié ». Le navigateur peut refuser le presse-papiers : le toast le dit, plutôt que de promettre une copie.

import { useCallback } from "react";
import { useToast } from "../design/toast";

export function useCopyLink(): (href: string) => void {
  const toast = useToast();
  return useCallback(
    (href) => {
      navigator.clipboard.writeText(`${window.location.origin}${href}`).then(
        () => toast("success", "Lien copié"),
        (error: unknown) => {
          console.warn("copie du lien : le navigateur refuse le presse-papiers", error);
          toast("error", "Copie impossible : le navigateur refuse le presse-papiers.");
        },
      );
    },
    [toast],
  );
}
