// Ce que montre la fenêtre du banni (JOURNAL 2026-09-25) : ouverte au ban, en direct ou à l'arrivée, avec sa preuve.
// « Je comprends » la ferme jusqu'au prochain ban ; un débannissement la ferme aussi.

import type { Pixel } from "@liveplace/domain/ports";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type { BannedWindowProps } from "./banned-window";

export function useBannedWindowProps(canvas: CanvasStore): BannedWindowProps {
  const { isBanned, userId, width, height, palette } = useSyncExternalStore(
    canvas.subscribe,
    canvas.getView,
    canvas.getView,
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [pixels, setPixels] = useState<readonly Pixel[] | null>(null);

  useEffect(() => {
    if (!isBanned || !userId) return;
    setIsDismissed(false);
    setPixels(null);
    let isCurrent = true;
    // Sa preuve est écrite par `ban` avant qu'il en soit prévenu : elle est déjà là.
    void canvas.listPixels(userId).then((result) => {
      if (!isCurrent) return;
      if (!result.ok)
        console.warn("banned-window : preuve illisible, la fenêtre s'ouvre sans elle", result.error);
      setPixels(result.ok ? result.value : []);
    });
    return () => {
      isCurrent = false;
    };
  }, [canvas, isBanned, userId]);

  return {
    isOpen: isBanned && !isDismissed,
    pixels,
    canvas: { width, height, palette },
    onClose: () => setIsDismissed(true),
  };
}
