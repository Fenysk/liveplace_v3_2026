// Retirer ou bannir depuis la pill Inspection (CDC 2026, JOURNAL 2026-09-25) : la demande, l'aperçu de ses pixels,
// puis l'action. Bannir enchaîne `ban` puis `clearUser`, jamais l'inverse (§5.4).

import { canModerate } from "@liveplace/domain";
import type { InspectEntry, Pixel } from "@liveplace/domain/ports";
import { useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import type {
  ModerationKind,
  ModerationRequest,
  ModerationStatus,
  ModerationWindowProps,
} from "./moderation-window";

// Ce que la pill Inspection reçoit quand on peut modérer. Le web affiche, le gateway décide (§10.3).
export type ModerationControls = {
  isProtected: (userId: string) => boolean; // le streamer et soi-même : aucun bouton
  onModerate: (kind: ModerationKind, author: InspectEntry) => void;
};

export function useModeration(canvas: CanvasStore): {
  controls: ModerationControls | undefined;
  window: ModerationWindowProps;
} {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [pixels, setPixels] = useState<readonly Pixel[] | null>(null);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  // La demande en cours : une réponse arrivée pour une demande abandonnée n'y touche plus.
  const current = useRef<ModerationRequest | null>(null);

  const open = (kind: ModerationKind, author: InspectEntry): void => {
    const next = { kind, author };
    current.current = next;
    setRequest(next);
    setPixels(null);
    setStatus("idle");
    void canvas.listPixels(author.userId).then((result) => {
      if (current.current !== next) return;
      setPixels(result.ok ? result.value : []);
      if (!result.ok) setStatus("failed");
    });
  };

  const close = (): void => {
    current.current = null;
    setRequest(null);
  };

  const confirm = async (): Promise<void> => {
    const active = current.current;
    if (!active || status === "running") return;
    setStatus("running");
    const target = active.author.userId;
    const banned = active.kind === "ban" ? await canvas.moderate({ action: "ban", target }) : null;
    const cleared = banned?.ok === false ? banned : await canvas.moderate({ action: "clearUser", target });
    if (current.current !== active) return;
    if (!cleared.ok) return setStatus("failed");
    // Pas d'étape « après » : la fenêtre et l'inspection se ferment, les pixels partent par le flux.
    setStatus("idle");
    close();
    canvas.closeInspection();
  };

  const controls: ModerationControls | undefined =
    view.role && canModerate(view.role)
      ? {
          isProtected: (userId) => userId === view.ownerId || userId === view.userId,
          onModerate: open,
        }
      : undefined;

  return {
    controls,
    window: {
      request,
      pixels,
      status,
      canvas: { width: view.width, height: view.height, palette: view.palette },
      onConfirm: () => void confirm(),
      onClose: () => {
        if (status !== "running") close();
      },
    },
  };
}
