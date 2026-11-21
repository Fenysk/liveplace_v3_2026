// Les dons de l'événement (CDC 2026, Mode événement) pour la ligne du bloc du titre : un seul à la fois, dans l'ordre d'arrivée, le
// suivant quand le premier part. Le bouton +N réclame tout le bonus en attente de ce compte ; sans bonus (invité, déjà réclamé),
// la ligne n'en a pas. Hors d'un événement en cours, un don n'ouvre rien : il est écarté.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { type DonationQueue, dropShownDonation, enqueueDonation } from "../../state/charity-event";
import type { DonationControls } from "../design/donation-toast";
import { useTexts } from "../locale/use-locale";
import { CHARITY_TEXTS } from "./charity-texts";

const NO_BONUS = 0;

export const useCharityDonations = (
  canvas: CanvasStore | undefined,
  isRunning: boolean,
): DonationControls => {
  const charityBonus = useSyncExternalStore(
    (listener) => (canvas ? canvas.subscribe(listener) : () => undefined),
    () => canvas?.getView().charityBonus ?? NO_BONUS,
    () => NO_BONUS,
  );
  const t = useTexts(CHARITY_TEXTS);
  const [queue, setQueue] = useState<DonationQueue>([]);
  const nextId = useRef(1);
  const unnamed = useRef(t.unnamed);
  unnamed.current = t.unnamed;
  const isRunningNow = useRef(isRunning);
  isRunningNow.current = isRunning;
  useEffect(() => {
    if (!canvas) return;
    return canvas.listenCharityDonations((donation) => {
      if (!isRunningNow.current) return;
      const id = nextId.current++;
      const donor = donation.name.trim() === "" ? unnamed.current : donation.name;
      setQueue((current) =>
        enqueueDonation(current, {
          id,
          donor,
          cents: donation.cents,
          currency: donation.currency,
          pixels: donation.pixels,
        }),
      );
    });
  }, [canvas]);
  // L'événement se termine (ou la page change de fresque) : les dons en attente ne s'ouvriraient plus nulle part.
  useEffect(() => {
    if (!isRunning || !canvas) setQueue((current) => (current.length === 0 ? current : []));
  }, [isRunning, canvas]);
  const first = queue[0];
  return {
    donation: first
      ? {
          id: first.id,
          donor: first.donor,
          amountCents: first.cents,
          currency: first.currency,
          pixels: first.pixels,
        }
      : null,
    onClaim: charityBonus > 0 && canvas ? canvas.claimCharityBonus : undefined,
    claimPixels: charityBonus,
    onDismiss: () => setQueue(dropShownDonation),
  };
};
