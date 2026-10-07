// Les toasts de la page (CDC 2026, Toasts) : la connexion perdue puis revenue, les pixels
// d'un envoi que le serveur a refusés, gardés dans le brouillon, et le streamer qui change de canvas
// (Écart §15, JOURNAL 2026-10-06).

import { useEffect } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { OwnSwitchTracker } from "../archive/own-switch";
import { useToast } from "../design/toast";
import { useLocale } from "../locale/use-locale";
import { CANVAS_TEXTS } from "./canvas-texts";
import { connectionToast } from "./connection-toast";
import { switchToast } from "./switch-toast";

// `ownerName` : le nom affiché du streamer, que le toast d'un changement de canvas dit.
export function useCanvasToasts(
  { canvas, draft }: { canvas: CanvasStore; draft: DraftStore },
  tracker: OwnSwitchTracker,
  ownerName: string,
): void {
  const toast = useToast();
  const locale = useLocale();
  useEffect(() => {
    let seen = canvas.getView();
    const onCanvas = () => {
      const next = canvas.getView();
      const connection = connectionToast(seen, next, locale);
      if (connection) toast(connection.tone, connection.text);
      // Le brouillon se lit ici, à l'instant de la bascule : la page ferme ce store un peu après.
      const switched = switchToast(
        seen,
        next,
        {
          hasAskedHere: tracker.isRecent(Date.now()),
          ownerName,
          draftSize: draft.getView().draft.size,
        },
        locale,
      );
      if (switched) toast("success", switched);
      seen = next;
    };
    // Un envoi fini, en ligne et sans ban, qui laisse des pixels : le serveur les a refusés (jauge, taille).
    let wasSending = draft.getView().isSending;
    const onDraft = () => {
      const { isSending, draft: remaining } = draft.getView();
      const { status: current, isBanned } = canvas.getView();
      if (wasSending && !isSending && remaining.size > 0 && current === "live" && !isBanned)
        toast("error", CANVAS_TEXTS[locale].refused(remaining.size));
      wasSending = isSending;
    };
    const unsubscribeCanvas = canvas.subscribe(onCanvas);
    const unsubscribeDraft = draft.subscribe(onDraft);
    return () => {
      unsubscribeCanvas();
      unsubscribeDraft();
    };
  }, [canvas, draft, toast, tracker, ownerName, locale]);
}
