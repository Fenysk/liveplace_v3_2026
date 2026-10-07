// Signaler une pose, et ses voisines dans une plage d'heures (CDC 2026, Signalement ; JOURNAL 2026-09-29) : la pill
// Inspection ouvre la fenêtre de modération, qui montre les pixels visés, puis le signalement part au serveur.
// Les poses signalées restent « Signalé » pendant la session.

import type { AuthoredPixel } from "@liveplace/domain/ports";
import { useRef, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import type { ReportControl } from "../inspection/inspection-pill";
import { type ClearScope, listClearedPixels, PLACEMENT_ONLY, toPlacementRange } from "./cleared-pixels";
import type { ModerationStatus, ModerationWindowProps, ReportTarget } from "./moderation-window";

type SentReport = Exclude<ReportControl["status"], "available">;

export function useReport(canvas: CanvasStore): {
  control: ReportControl | undefined;
  window: ModerationWindowProps;
} {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const toast = useToast();
  const [sent, setSent] = useState<ReadonlyMap<string, SentReport>>(new Map());
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [pixels, setPixels] = useState<readonly AuthoredPixel[] | null>(null);
  const [scope, setScope] = useState<ClearScope>(PLACEMENT_ONLY);
  const [status, setStatus] = useState<ModerationStatus>("idle");
  // La demande en cours : une réponse arrivée pour une demande abandonnée n'y touche plus.
  const current = useRef<ReportTarget | null>(null);

  const mark = (placementId: string, next: SentReport | null) =>
    setSent((shown) => {
      const marked = new Map(shown);
      if (next) marked.set(placementId, next);
      else marked.delete(placementId);
      return marked;
    });

  const open = (next: ReportTarget): void => {
    current.current = next;
    setTarget(next);
    setPixels(null);
    setScope(PLACEMENT_ONLY);
    setStatus("idle");
    void canvas.listAuthorPixels(next.x, next.y, next.placementId).then((result) => {
      if (current.current !== next) return;
      setPixels(result.ok ? result.value : []);
      if (!result.ok) setStatus("failed");
    });
  };

  const close = (): void => {
    current.current = null;
    setTarget(null);
  };

  // Cette pose seule, ou ses voisines : la plage de l'aperçu, calculée sur les mêmes pixels.
  const rangeOf = ({ placementId }: ReportTarget) =>
    scope.spanMs > 0 ? (toPlacementRange(pixels ?? [], [placementId], scope.spanMs) ?? undefined) : undefined;

  // Refusé (la case a changé, ou la pose ne se signale plus) : la fenêtre le dit, le bouton de la pill revient.
  const confirm = async (): Promise<void> => {
    const active = current.current;
    if (!active || status === "running") return;
    setStatus("running");
    mark(active.placementId, "sending");
    const result = await canvas.report(active.x, active.y, active.placementId, rangeOf(active));
    mark(active.placementId, result.ok ? "reported" : null);
    if (current.current !== active) return;
    if (result.ok) toast("success", "Signalement envoyé");
    else if (result.error === "closed") return setStatus("failed");
    else toast("error", "Signalement refusé : la case a changé, ou la pose ne se signale plus.");
    close();
  };

  const { inspection } = view;
  const found = inspection?.status === "found" ? inspection : null;
  const sentStatus = found ? sent.get(found.entry.placementId) : undefined;
  const control: ReportControl | undefined =
    found && (sentStatus || found.entry.canReport)
      ? {
          status: sentStatus ?? "available",
          onReport: () => {
            if (sentStatus) return;
            const { x, y, entry } = found;
            open({ x, y, displayName: entry.displayName, placementId: entry.placementId });
          },
        }
      : undefined;

  return {
    control,
    window: {
      request: target ? { kind: "report", author: target } : null,
      pixels: pixels && target ? listClearedPixels(pixels, target, scope) : pixels,
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
