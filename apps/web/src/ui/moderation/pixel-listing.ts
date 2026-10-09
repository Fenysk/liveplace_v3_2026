// Le chargement des pixels d'un aperçu de modération, écrit une fois : chaque lecture, comme `drop`, remplace la
// précédente, et la réponse d'une cible, d'une ouverture ou d'une fenêtre périmée n'atteint jamais l'écran.

import type { AuthoredPixel } from "@liveplace/domain/ports";
import { useEffect, useState } from "react";
import type { RequestResult } from "../../state/canvas-store";

export const createPixelListing = (show: (pixels: readonly AuthoredPixel[] | null) => void) => {
  let ticket = 0;
  return {
    // `null` tant que la lecture court ; un échec montre une liste vide et le dit.
    list(read: Promise<RequestResult<AuthoredPixel[]>>, onFailed?: (error: string) => void): void {
      ticket += 1;
      const mine = ticket;
      show(null);
      void read.then((result) => {
        if (mine !== ticket) return;
        show(result.ok ? result.value : []);
        if (!result.ok) onFailed?.(result.error);
      });
    },
    // La fermeture : plus aucune réponse ne passe, l'aperçu garde ce qu'il montre.
    drop(): void {
      ticket += 1;
    },
  };
};

export function usePixelListing() {
  const [pixels, setPixels] = useState<readonly AuthoredPixel[] | null>(null);
  const [listing] = useState(() => createPixelListing(setPixels));
  useEffect(() => listing.drop, [listing]);
  return { pixels, ...listing };
}
