// La section Canvas, branchée sur le store (JOURNAL 2026-09-29) : le thème du canvas, son fond (Écart §9.1, JOURNAL 2026-10-10), la taille
// dynamique (Écart §5.3, JOURNAL 2026-10-28) ou la taille choisie, sa confirmation, puis la demande au gateway. La nouvelle taille arrive
// d'elle-même, par un `welcome` et un snapshot, à toutes les pages. Retirer la taille dynamique ramène la fresque à la taille fixe par défaut
// (JOURNAL 2026-10-29) : avec des dessins qui sortiraient du cadre, c'est la confirmation d'un format plus petit ; sans, rien à confirmer.

import { type CanvasSize, FIXED_DEFAULT_CANVAS_SIZE } from "@liveplace/domain";
import { useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { CanvasSettings, type ResizeStatus, ResizeWindow } from "./canvas-settings";
import { previewResize, type SizeChoice, toCanvasSize, toSizeChoice, turnOffPreview } from "./canvas-size";
import { CANVAS_TEXTS } from "./canvas-texts";
import { useBackgroundFields } from "./use-background-fields";
import { useDynamicSizeField } from "./use-dynamic-size-field";
import { useThemeField } from "./use-theme-field";

// `canvasId` et `login` : ceux de la page, qui visent l'image du fond.
type CanvasTabProps = { canvas: CanvasStore; canvasId: string; login: string };

// Ce que la fenêtre de confirmation s'apprête à faire : changer de format, ou retirer la taille dynamique.
type Confirming = "resize" | "turnOff" | null;

const NOTHING_OUTSIDE = { outside: [], hasMovedPixels: false };

const sizeOf = (confirming: Confirming, chosen: CanvasSize | null): CanvasSize | null => {
  if (confirming === "turnOff") return FIXED_DEFAULT_CANVAS_SIZE;
  return confirming === "resize" ? chosen : null;
};

export const CanvasTab = ({ canvas, canvasId, login }: CanvasTabProps) => {
  const { width, height, palette, pixels } = useSyncExternalStore(
    canvas.subscribe,
    canvas.getView,
    canvas.getView,
  );
  const current = { width, height };
  // Le choix de la personne, tant qu'elle n'a rien changé : la taille d'aujourd'hui, dans son format s'il y en a un.
  const [picked, setPicked] = useState<SizeChoice | null>(null);
  const choice = picked ?? toSizeChoice(current);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [status, setStatus] = useState<ResizeStatus>("idle");
  const chosen = choice && toCanvasSize(choice);
  const next = sizeOf(confirming, chosen);
  const preview = next ? previewResize(pixels, current, next) : NOTHING_OUTSIDE;
  const toast = useToast();
  const t = useTexts(CANVAS_TEXTS);
  const theme = useThemeField();
  const { background, image } = useBackgroundFields({ canvas, canvasId, login });
  const dynamic = useDynamicSizeField(canvas);

  // Retirer le réglage : des dessins sortiraient du cadre de 50 × 50, la confirmation s'ouvre ; sinon la case se décoche et la taille change.
  const toggleDynamic = (isOn: boolean) => {
    setPicked(null);
    if (isOn || turnOffPreview(pixels, current).outside.length === 0) {
      void dynamic.set(isOn);
      return;
    }
    setStatus("idle");
    setConfirming("turnOff");
  };

  const confirm = () => {
    if (!next) return;
    setStatus("running");
    const request =
      confirming === "turnOff"
        ? dynamic.set(false)
        : canvas.resizeCanvas(next.width, next.height).then((result) => result.ok);
    void request.then((isDone) => {
      setStatus(isDone ? "idle" : "failed");
      if (!isDone) return;
      setConfirming(null);
      setPicked(null);
      if (confirming === "resize") toast("success", t.sizeChanged(next));
    });
  };

  return (
    <>
      <CanvasSettings
        theme={theme}
        background={background}
        image={image}
        dynamic={{ isOn: dynamic.isOn, isBusy: dynamic.isBusy, onToggle: toggleDynamic }}
        current={current}
        choice={choice}
        chosen={chosen}
        onChoose={setPicked}
        onApply={() => {
          setStatus("idle");
          setConfirming("resize");
        }}
      />
      <ResizeWindow
        next={next}
        outside={preview.outside}
        hasMovedPixels={preview.hasMovedPixels}
        status={status}
        canvas={{ width, height, palette }}
        onConfirm={confirm}
        onClose={() => {
          if (status !== "running") setConfirming(null);
        }}
      />
    </>
  );
};
