// Copier le lien d'une archive (§17.1) : l'adresse entière, puis le toast « Lien
// copié ». Le navigateur peut refuser le presse-papiers : le toast le dit, plutôt que de promettre une copie.

import { useCallback } from "react";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { ARCHIVE_TEXTS } from "./archive-texts";

export function useCopyLink(): (href: string) => void {
  const toast = useToast();
  const t = useTexts(ARCHIVE_TEXTS);
  return useCallback(
    (href) => {
      navigator.clipboard.writeText(`${window.location.origin}${href}`).then(
        () => toast("success", t.linkCopied),
        (error: unknown) => {
          console.warn("copie du lien : le navigateur refuse le presse-papiers", error);
          toast("error", t.copyRefused);
        },
      );
    },
    [toast, t],
  );
}
