// La section Canvas, branchée sur le store (JOURNAL 2026-09-29) : le thème du canvas, la taille choisie, sa confirmation,
// puis la demande au gateway. La nouvelle taille arrive d'elle-même, par un `welcome` et un snapshot, à toutes les pages.

import { useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { CanvasSettings, type ResizeStatus, ResizeWindow } from "./canvas-settings";
import { listOutsidePixels, type SizeChoice, toCanvasSize, toSizeChoice } from "./canvas-size";
import { useThemeField } from "./use-theme-field";

type CanvasTabProps = { canvas: CanvasStore };

export const CanvasTab = ({ canvas }: CanvasTabProps) => {
  const { width, height, palette, pixels } = useSyncExternalStore(
    canvas.subscribe,
    canvas.getView,
    canvas.getView,
  );
  const current = { width, height };
  const [choice, setChoice] = useState<SizeChoice>(() => toSizeChoice(current));
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState<ResizeStatus>("idle");
  const chosen = toCanvasSize(choice);
  const toast = useToast();
  const theme = useThemeField();

  const confirm = () => {
    setStatus("running");
    void canvas.resizeCanvas(chosen.width, chosen.height).then((result) => {
      setStatus(result.ok ? "idle" : "failed");
      if (!result.ok) return;
      setIsConfirming(false);
      toast("success", `Taille changée : ${chosen.width} × ${chosen.height} cases`);
    });
  };

  return (
    <>
      <CanvasSettings
        theme={theme}
        current={current}
        choice={choice}
        chosen={chosen}
        onChoose={setChoice}
        onApply={() => {
          setStatus("idle");
          setIsConfirming(true);
        }}
      />
      <ResizeWindow
        next={isConfirming ? chosen : null}
        outside={isConfirming ? listOutsidePixels(pixels, current, chosen) : []}
        status={status}
        canvas={{ width, height, palette }}
        onConfirm={confirm}
        onClose={() => {
          if (status !== "running") setIsConfirming(false);
        }}
      />
    </>
  );
};
