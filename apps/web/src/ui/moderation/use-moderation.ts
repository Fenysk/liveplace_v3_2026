// Retirer ou bannir depuis la pill Inspection (CDC 2026, JOURNAL 2026-09-25), ou depuis un signalement (JOURNAL
// 2026-09-28) : la demande, l'aperçu de ses pixels, puis l'action. Bannir enchaîne `ban` puis `clearUser`, jamais
// l'inverse (§5.4). Un retrait fait, la fenêtre propose de bannir l'auteur (JOURNAL 2026-09-29).

import { canModerate } from "@liveplace/domain";
import type { AuthoredPixel } from "@liveplace/domain/ports";
import { useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore, ModerationAction } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { type ClearScope, listClearedPixels, PLACEMENT_ONLY, toClearAction } from "./cleared-pixels";
import type {
  ModeratedAuthor,
  ModerationStatus,
  ModerationTarget,
  ModerationWindowProps,
} from "./moderation-window";

// Ce que propose qui modère : retirer ses pixels, ou le bannir.
type ModeratorKind = "clear" | "ban" | "banAfterClear";
type ModeratorRequest = { kind: ModeratorKind; author: ModerationTarget };

// Ce que la pill Inspection et la liste des signalements reçoivent quand on peut modérer. Le web affiche, le gateway
// décide (§10.3).
export type ModerationControls = {
  isProtected: (userId: string) => boolean; // le streamer et soi-même : aucun bouton
  onModerate: (kind: Exclude<ModeratorKind, "banAfterClear">, author: ModerationTarget) => void;
  // JOURNAL 2026-09-27 : le streamer seul nomme ou retire un modérateur. Absent pour un modérateur.
  onSetModerator?: ((author: ModeratedAuthor, isModerator: boolean) => void) | undefined;
};

export function useModeration(canvas: CanvasStore): {
  controls: ModerationControls | undefined;
  window: ModerationWindowProps;
} {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const toast = useToast();
  const [request, setRequest] = useState<ModeratorRequest | null>(null);
  const [pixels, setPixels] = useState<readonly AuthoredPixel[] | null>(null);
  const [scope, setScope] = useState<ClearScope>(PLACEMENT_ONLY);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  // La demande en cours : une réponse arrivée pour une demande abandonnée n'y touche plus.
  const current = useRef<ModeratorRequest | null>(null);

  const show = (next: ModeratorRequest | null): void => {
    current.current = next;
    setRequest(next);
    setStatus("idle");
  };

  const open = (kind: ModeratorKind, author: ModerationTarget): void => {
    const next = { kind, author };
    show(next);
    setPixels(null);
    setScope(PLACEMENT_ONLY);
    void canvas.listPixels(author.userId).then((result) => {
      if (current.current !== next) return;
      setPixels(result.ok ? result.value : []);
      if (!result.ok) setStatus("failed");
    });
  };

  // Pas d'étape « après » un ban : la fenêtre et l'inspection se ferment, les pixels partent par le flux.
  const finish = (): void => {
    show(null);
    canvas.closeInspection();
  };

  // Bannir retire tous ses pixels ; Retirer ses pixels suit la case et le curseur.
  const clearActionOf = ({ kind, author }: ModeratorRequest): ModerationAction =>
    kind === "clear"
      ? toClearAction(author, pixels ?? [], scope)
      : { action: "clearUser", target: author.userId };

  const run = async (active: ModeratorRequest) => {
    const banned =
      active.kind === "clear" ? null : await canvas.moderate({ action: "ban", target: active.author.userId });
    return banned?.ok === false ? banned : canvas.moderate(clearActionOf(active));
  };

  const confirm = async (): Promise<void> => {
    const active = current.current;
    if (!active || status === "running") return;
    setStatus("running");
    const done = await run(active);
    if (current.current !== active) return;
    if (!done.ok) return setStatus("failed");
    // La preuve du ban qui suivrait : tous ses pixels d'avant le retrait, que le serveur garde une heure.
    if (active.kind === "clear") return show({ kind: "banAfterClear", author: active.author });
    finish();
    toast("success", `${active.author.displayName} est banni·e de ce canvas`);
  };

  // La pill se relit après : elle montre alors le nouveau rôle de l'auteur.
  const setModerator = (author: ModeratedAuthor, isModerator: boolean): void => {
    void canvas.setModerator(author.userId, isModerator).then((result) => {
      const { inspection } = canvas.getView();
      if (inspection) canvas.inspect(inspection.x, inspection.y);
      if (!result.ok) return toast("error", "Le rôle n'a pas changé : réessaie dans un instant.");
      toast("success", `${author.displayName} ${isModerator ? "est" : "n'est plus"} modérateur·rice`);
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
      // Refuser le ban qui suit un retrait ferme aussi l'inspection : le retrait est fait.
      onClose: () => {
        if (status === "running") return;
        if (request?.kind === "banAfterClear") finish();
        else show(null);
      },
    },
  };
}
