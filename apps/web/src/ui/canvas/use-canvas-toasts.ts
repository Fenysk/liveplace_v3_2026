// Les toasts de la page (CDC 2026, Toasts) : la connexion perdue puis revenue, et les pixels
// d'un envoi que le serveur a refusés, gardés dans le brouillon.

import { useEffect } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import { useToast } from "../design/toast";

const refusedLabel = (count: number): string =>
  count === 1
    ? "1 pixel refusé : il reste dans le brouillon."
    : `${count.toLocaleString("fr-FR")} pixels refusés : ils restent dans le brouillon.`;

export function useCanvasToasts({ canvas, draft }: { canvas: CanvasStore; draft: DraftStore }): void {
  const toast = useToast();
  useEffect(() => {
    let status = canvas.getView().status;
    const onCanvas = () => {
      const next = canvas.getView().status;
      if (status === "live" && next === "reconnecting")
        toast("error", "Connexion perdue : la page se reconnecte.");
      if (status === "reconnecting" && next === "live") toast("success", "Reconnecté");
      status = next;
    };
    // Un envoi fini, en ligne et sans ban, qui laisse des pixels : le serveur les a refusés (jauge, taille).
    let wasSending = draft.getView().isSending;
    const onDraft = () => {
      const { isSending, draft: remaining } = draft.getView();
      const { status: current, isBanned } = canvas.getView();
      if (wasSending && !isSending && remaining.size > 0 && current === "live" && !isBanned)
        toast("error", refusedLabel(remaining.size));
      wasSending = isSending;
    };
    const unsubscribeCanvas = canvas.subscribe(onCanvas);
    const unsubscribeDraft = draft.subscribe(onDraft);
    return () => {
      unsubscribeCanvas();
      unsubscribeDraft();
    };
  }, [canvas, draft, toast]);
}
