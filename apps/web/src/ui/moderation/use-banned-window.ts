// Ce que montre la fenêtre du banni (JOURNAL 2026-09-25) : ouverte au ban, en direct ou à l'arrivée, avec sa preuve.
// « Je comprends » la ferme jusqu'au prochain ban ; un débannissement la ferme aussi.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { BannedWindowProps } from "./banned-window";
import { usePixelListing } from "./pixel-listing";

export function useBannedWindowProps(canvas: CanvasStore): BannedWindowProps {
  const { isBanned, userId, width, height, palette } = useSyncExternalStore(
    canvas.subscribe,
    canvas.getView,
    canvas.getView,
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const { pixels, list, drop } = usePixelListing();

  useEffect(() => {
    if (!isBanned || !userId) return;
    setIsDismissed(false);
    // Sa preuve est écrite par `ban` avant qu'il en soit prévenu : elle est déjà là.
    list(canvas.listPixels(userId), (error) =>
      console.warn("banned-window : preuve illisible, la fenêtre s'ouvre sans elle", error),
    );
    return drop;
  }, [canvas, isBanned, userId, list, drop]);

  return {
    isOpen: isBanned && !isDismissed,
    pixels,
    canvas: { width, height, palette },
    onClose: () => setIsDismissed(true),
  };
}
