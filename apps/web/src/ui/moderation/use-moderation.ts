// Retirer ou bannir depuis la pill Inspection (CDC 2026, JOURNAL 2026-09-25), ou depuis un signalement (JOURNAL
// 2026-09-28) : la demande, l'aperçu de ses pixels, puis l'action. Bannir enchaîne `ban` puis `clearUser`, jamais
// l'inverse (§5.4).

import { canModerate } from "@liveplace/domain";
import type { AuthoredPixel } from "@liveplace/domain/ports";
import { useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore, ModerationAction } from "../../state/canvas-store";
import { type ClearScope, listClearedPixels, PLACEMENT_ONLY, toClearAction } from "./cleared-pixels";
import type {
  ModeratedAuthor,
  ModerationKind,
  ModerationRequest,
  ModerationStatus,
  ModerationTarget,
  ModerationWindowProps,
} from "./moderation-window";

// Ce que la pill Inspection et la liste des signalements reçoivent quand on peut modérer. Le web affiche, le gateway
// décide (§10.3).
export type ModerationControls = {
  isProtected: (userId: string) => boolean; // le streamer et soi-même : aucun bouton
  onModerate: (kind: ModerationKind, author: ModerationTarget) => void;
  // JOURNAL 2026-09-27 : le streamer seul nomme ou retire un modérateur. Absent pour un modérateur.
  onSetModerator?: ((author: ModeratedAuthor, isModerator: boolean) => void) | undefined;
};

export function useModeration(canvas: CanvasStore): {
  controls: ModerationControls | undefined;
  window: ModerationWindowProps;
} {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [pixels, setPixels] = useState<readonly AuthoredPixel[] | null>(null);
  const [scope, setScope] = useState<ClearScope>(PLACEMENT_ONLY);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  // La demande en cours : une réponse arrivée pour une demande abandonnée n'y touche plus.
  const current = useRef<ModerationRequest | null>(null);

  const open = (kind: ModerationKind, author: ModerationTarget): void => {
    const next = { kind, author };
    current.current = next;
    setRequest(next);
    setPixels(null);
    setScope(PLACEMENT_ONLY);
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

  // Bannir retire tous ses pixels ; Retirer ses pixels suit la case et le curseur.
  const clearActionOf = ({ kind, author }: ModerationRequest): ModerationAction =>
    kind === "ban"
      ? { action: "clearUser", target: author.userId }
      : toClearAction(author, pixels ?? [], scope);

  const run = async (active: ModerationRequest) => {
    const banned =
      active.kind === "ban" ? await canvas.moderate({ action: "ban", target: active.author.userId }) : null;
    return banned?.ok === false ? banned : canvas.moderate(clearActionOf(active));
  };

  const confirm = async (): Promise<void> => {
    const active = current.current;
    if (!active || status === "running") return;
    setStatus("running");
    const cleared = await run(active);
    if (current.current !== active) return;
    if (!cleared.ok) return setStatus("failed");
    // Pas d'étape « après » : la fenêtre et l'inspection se ferment, les pixels partent par le flux.
    setStatus("idle");
    close();
    canvas.closeInspection();
  };

  // La pill se relit après : elle montre alors le nouveau rôle de l'auteur.
  const setModerator = (author: ModeratedAuthor, isModerator: boolean): void => {
    void canvas.setModerator(author.userId, isModerator).then(() => {
      const { inspection } = canvas.getView();
      if (inspection) canvas.inspect(inspection.x, inspection.y);
    });
  };

  const controls: ModerationControls | undefined =
    view.role && canModerate(view.role)
      ? {
          isProtected: (userId) => userId === view.ownerId || userId === view.userId,
          onModerate: open,
          ...(view.role === "owner" ? { onSetModerator: setModerator } : {}),
        }
      : undefined;

  // L'aperçu suit la case et le curseur ; bannir montre toujours tous ses pixels.
  const shownPixels =
    pixels && request?.kind === "clear" ? listClearedPixels(pixels, request.author, scope) : pixels;

  return {
    controls,
    window: {
      request,
      pixels: shownPixels,
      scope,
      status,
      canvas: { width: view.width, height: view.height, palette: view.palette },
      onScope: setScope,
      onConfirm: () => void confirm(),
      onClose: () => {
        if (status !== "running") close();
      },
    },
  };
}
