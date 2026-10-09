// Retirer ou bannir depuis la pill Inspection (CDC 2026, JOURNAL 2026-09-25), ou depuis un signalement (JOURNAL
// 2026-09-28) : la demande, l'aperçu de ses pixels, puis l'action. Bannir enchaîne `ban` puis `clearUser`, jamais
// l'inverse (§5.4). Une ligne de signalements retire ses poses l'une après l'autre (JOURNAL 2026-10-07). Un retrait
// fait, la fenêtre propose de bannir l'auteur (JOURNAL 2026-09-29).

import { canModerate } from "@liveplace/domain";
import { useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore, ModerationAction } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { canBan } from "./can-ban";
import { type ClearScope, listClearedPixels, PLACEMENT_ONLY, toClearActions } from "./cleared-pixels";
import { moderateInOrder } from "./moderate-in-order";
import type {
  ModeratedAuthor,
  ModerationStatus,
  ModerationTarget,
  ModerationWindowProps,
} from "./moderation-window";
import { usePixelListing } from "./pixel-listing";

// Ce que propose qui modère : retirer ses pixels, ou le bannir.
type ModeratorKind = "clear" | "ban" | "banAfterClear";
export type ModeratorRequest = { kind: ModeratorKind; author: ModerationTarget };

// Un retrait fait, la fenêtre propose de bannir (JOURNAL 2026-09-29) ; `null` : rien après. Écart §5.4 (JOURNAL 2026-10-08) :
// pas pour un modérateur nommé ici, le retrait suffit.
export const askBanAfterClear = ({ kind, author }: ModeratorRequest): ModeratorRequest | null =>
  kind === "clear" && canBan(author) ? { kind: "banAfterClear", author } : null;

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
  const { pixels, list, drop } = usePixelListing();
  const [scope, setScope] = useState<ClearScope>(PLACEMENT_ONLY);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  // La demande en cours : la réponse d'un retrait ou d'un ban d'une demande abandonnée n'y touche plus.
  const current = useRef<ModeratorRequest | null>(null);

  const show = (next: ModeratorRequest | null): void => {
    current.current = next;
    setRequest(next);
    setStatus("idle");
    if (!next) drop();
  };

  const open = (kind: ModeratorKind, author: ModerationTarget): void => {
    show({ kind, author });
    setScope(PLACEMENT_ONLY);
    list(canvas.listPixels(author.userId), () => setStatus("failed"));
  };

  // Pas d'étape « après » un ban : la fenêtre et l'inspection se ferment, les pixels partent par le flux.
  const finish = (): void => {
    show(null);
    canvas.closeInspection();
  };

  // Retirer ses pixels suit la case et le curseur ; bannir enchaîne `ban`, puis retire tous ses pixels.
  const actionsOf = ({ kind, author }: ModeratorRequest): ModerationAction[] =>
    kind === "clear"
      ? toClearActions(author, pixels ?? [], scope)
      : [
          { action: "ban", target: author.userId },
          { action: "clearUser", target: author.userId },
        ];

  const confirm = async (): Promise<void> => {
    const active = current.current;
    if (!active || status === "running") return;
    setStatus("running");
    const done = await moderateInOrder(canvas, actionsOf(active));
    if (current.current !== active) return;
    if (!done.ok) return setStatus("failed");
    // La preuve du ban qui suivrait : tous ses pixels d'avant le retrait, que le serveur garde une heure.
    const next = askBanAfterClear(active);
    if (next) return show(next);
    finish();
    if (active.kind !== "clear") toast("success", `${active.author.displayName} est banni·e de ce canvas`);
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
