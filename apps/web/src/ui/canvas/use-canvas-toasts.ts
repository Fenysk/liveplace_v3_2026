// Les toasts de la page (CDC 2026, Toasts) : la connexion perdue puis revenue, les pixels
// d'un envoi que le serveur a refusés, gardés dans le brouillon, le streamer qui change de canvas
// (§17.1), le brouillon effacé par une réduction qui rapproche les dessins (§5.8), et le Dessin fermé hors du live du streamer.

import { useEffect, useRef } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { DraftStore } from "../../state/draft-store";
import type { OwnSwitchTracker } from "../archive/own-switch";
import { useToast } from "../design/toast";
import { DRAFT_TEXTS } from "../draft/draft-texts";
import { useLocale } from "../locale/use-locale";
import { CANVAS_TEXTS } from "./canvas-texts";
import { connectionToast } from "./connection-toast";
import { switchToast } from "./switch-toast";

// `ownerName` : le nom affiché du streamer, que le toast d'un changement de canvas dit.
// `isDeletingAccount` (CDC §8) : la suppression du compte est lancée, le gateway ferme la socket (4001) : la connexion perdue puis revenue ne se dit pas.
export function useCanvasToasts(
  { canvas, draft }: { canvas: CanvasStore; draft: DraftStore },
  tracker: OwnSwitchTracker,
  ownerName: string,
  isDeletingAccount: boolean,
): void {
  const toast = useToast();
  const locale = useLocale();
  // Écrit pendant le rendu, lu par l'abonnement : l'abonné ne se refait pas à chaque changement.
  const isDeleting = useRef(isDeletingAccount);
  isDeleting.current = isDeletingAccount;
  useEffect(() => {
    let seen = canvas.getView();
    const onCanvas = () => {
      const next = canvas.getView();
      const connection = connectionToast(seen, next, locale, { isDeletingAccount: isDeleting.current });
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
      const { status: current, isBanned, isDrawingClosed } = canvas.getView();
      if (
        wasSending &&
        !isSending &&
        remaining.size > 0 &&
        current === "live" &&
        !isBanned &&
        !isDrawingClosed
      )
        toast("error", CANVAS_TEXTS[locale].refused(remaining.size));
      wasSending = isSending;
    };
    const unsubscribeCanvas = canvas.subscribe(onCanvas);
    const unsubscribeDraft = draft.subscribe(onDraft);
    const unsubscribeWiped = draft.listenWiped(() => toast("success", CANVAS_TEXTS[locale].draftWiped));
    // JOURNAL 2026-11-12 : fresque réservée au live, streamer hors live : Dessiner, un raccourci ou la fermeture sous un viewer le disent.
    const unsubscribeClosed = draft.listenClosed(() =>
      toast("error", DRAFT_TEXTS[locale].waitingForLive(ownerName)),
    );
    return () => {
      unsubscribeClosed();
      unsubscribeCanvas();
      unsubscribeDraft();
      unsubscribeWiped();
    };
  }, [canvas, draft, toast, tracker, ownerName, locale]);
}
