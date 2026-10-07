// Ce que montre la section « Archives », tiré des fonctions serveur du streamer (Écart §15, JOURNAL 2026-10-06) :
// la liste, la demande de confirmation en cours, et l'action qu'elle déclenche. Montée à l'ouverture de la section, et
// de nouveau quand le canvas actif change (la clé du parent).

import type { Result } from "@liveplace/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  archiveCanvasFn,
  discardArchiveFn,
  listCanvasesFn,
  reopenCanvasFn,
} from "../../routes/-owner-canvases";
import type { CanvasStore } from "../../state/canvas-store";
import type { ProgressChoice, SwitchError } from "../../usecase/canvas-switch";
import type { ListedArchive } from "../../usecase/list-canvases";
import { useToast } from "../design/toast";
import {
  archiveHref,
  ownerToast,
  type SwitchFailure,
  shouldReloadAfter,
  startingTheme,
} from "./archive-texts";
import type { ArchivesList } from "./canvas-cards";
import type { OwnSwitchTracker } from "./own-switch";
import type { SwitchRequest, SwitchStatus } from "./switch-window";
import { useCopyLink } from "./use-copy-link";

type SwitchResult = Result<void, SwitchError | "unauthenticated">;

export function useOwnerCanvases(canvas: CanvasStore, login: string, tracker: OwnSwitchTracker) {
  const { reportCount } = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const toast = useToast();
  const copyLink = useCopyLink();
  const [list, setList] = useState<ArchivesList>({ status: "loading" });
  const [request, setRequest] = useState<SwitchRequest | null>(null);
  const [discarding, setDiscarding] = useState<ListedArchive | null>(null);
  const [theme, setTheme] = useState("");
  const [progress, setProgress] = useState<ProgressChoice | null>(null);
  const [status, setStatus] = useState<SwitchStatus>("idle");
  const [failure, setFailure] = useState<SwitchFailure | null>(null);

  const reload = useCallback(() => {
    listCanvasesFn().then(
      (result) => setList(result.ok ? { status: "ready", canvases: result.value } : { status: "failed" }),
      (error: unknown) => {
        console.error("mes canvas : liste non lue", error);
        setList({ status: "failed" });
      },
    );
  }, []);
  useEffect(reload, [reload]);

  // Une action : le streamer attend sa réponse, la fenêtre reste verrouillée. Un changement de canvas se souvient
  // d'avoir été demandé ici : la page prévient ses viewers, pas son streamer, qui a son propre toast.
  const run = async (operation: () => Promise<SwitchResult>, success: string, isSwitch: boolean) => {
    setStatus("running");
    setFailure(null);
    if (isSwitch) tracker.mark(Date.now());
    try {
      const result = await operation();
      if (isSwitch) tracker.mark(Date.now());
      if (!result.ok) {
        setStatus("failed");
        setFailure(result.error);
        // Une page qui n'était plus à jour se répare d'elle-même : la liste se recharge derrière la fenêtre.
        if (shouldReloadAfter(result.error)) reload();
        return;
      }
      toast("success", success);
      setRequest(null);
      setDiscarding(null);
      setStatus("idle");
      reload();
    } catch (error) {
      console.error("mes canvas : action sans réponse", error);
      setStatus("failed");
      setFailure("network");
      // Le serveur a pu finir sans que la page le sache : la liste dit où il en est.
      reload();
    }
  };

  const open = (next: SwitchRequest) => {
    setTheme(startingTheme(next));
    setProgress(null);
    setStatus("idle");
    setFailure(null);
    setRequest(next);
  };

  const confirm = () => {
    if (!request || !progress) return;
    if (request.kind === "archive") {
      const { canvasId } = request.canvas;
      void run(() => archiveCanvasFn({ data: { canvasId, theme, progress } }), ownerToast("archive"), true);
    } else {
      const { canvasId } = request.archive;
      void run(() => reopenCanvasFn({ data: { canvasId, progress } }), ownerToast("reopen"), true);
    }
  };

  const confirmDiscard = () => {
    if (!discarding) return;
    const { canvasId } = discarding;
    void run(() => discardArchiveFn({ data: { canvasId } }), ownerToast("discard"), false);
  };

  return {
    section: {
      list,
      login,
      onArchive: () => {
        if (list.status === "ready" && list.canvases.active)
          open({ kind: "archive", canvas: list.canvases.active });
      },
      onCopyLink: (archive: ListedArchive) => copyLink(archiveHref(login, archive.linkCode)),
      onReopen: (archive: ListedArchive) => open({ kind: "reopen", archive }),
      onDiscard: (archive: ListedArchive) => {
        setStatus("idle");
        setFailure(null);
        setDiscarding(archive);
      },
      onRetry: () => {
        setList({ status: "loading" });
        reload();
      },
    },
    switchWindow: {
      request,
      theme,
      onTheme: setTheme,
      progress,
      onProgress: setProgress,
      pendingReports: reportCount,
      status,
      failure,
      onConfirm: confirm,
      onClose: () => {
        if (status !== "running") setRequest(null);
      },
    },
    discardWindow: {
      archive: discarding,
      status,
      failure,
      onConfirm: confirmDiscard,
      onClose: () => {
        if (status !== "running") setDiscarding(null);
      },
    },
  };
}
