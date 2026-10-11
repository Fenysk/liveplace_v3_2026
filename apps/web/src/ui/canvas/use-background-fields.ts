// Le fond de la fresque et son image dans la section Canvas (Écart §9.1, JOURNAL 2026-10-10), branchés sur le store : le fond et l'opacité
// choisis partent au gateway, et la valeur affichée est la demandée tant que la frame du gateway ne l'a pas confirmée, comme le délai
// OBS. L'image se prépare dans la page, part au web, et revient d'elle-même par la frame `backgroundImage`.

import { BACKGROUND_IMAGE_OPACITY, OBS_BACKGROUND, type ObsBackground } from "@liveplace/domain";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearCanvasBackgroundImageFn } from "../../routes/-owner-canvases";
import { backgroundImagePath } from "../../shared/background-image-path";
import type { CanvasStore } from "../../state/canvas-store";
import { DESIGN_TEXTS } from "../design/design-texts";
import { useToast } from "../design/toast";
import { COMPACT_SCREEN_QUERY, useMediaQuery } from "../design/use-media-query";
import { useTexts } from "../locale/use-locale";
import { prepareBackgroundImage } from "./background-image-file";
import { uploadBackgroundImage } from "./background-image-upload";
import type { BackgroundField, BackgroundImageField } from "./canvas-settings";
import { CANVAS_TEXTS } from "./canvas-texts";

type BackgroundFieldsInput = { canvas: CanvasStore; canvasId: string; login: string };

// Une valeur demandée, que la frame du gateway confirme : `onConfirm` dit alors le toast, et la demande s'efface.
function useRequested<Value>(confirmed: Value, onConfirm: (value: Value) => void) {
  const [requested, setRequested] = useState<Value | null>(null);
  useEffect(() => {
    if (requested !== confirmed) return;
    setRequested(null);
    onConfirm(confirmed);
  }, [requested, confirmed, onConfirm]);
  return [requested, setRequested] as const;
}

export function useBackgroundFields({ canvas, canvasId, login }: BackgroundFieldsInput): {
  background: BackgroundField;
  image: BackgroundImageField;
} {
  const getBackground = () => canvas.getView().params?.obsBackground ?? OBS_BACKGROUND;
  const getImageAt = () => canvas.getView().params?.backgroundImageAt;
  const getOpacity = () => canvas.getView().params?.backgroundImageOpacity ?? BACKGROUND_IMAGE_OPACITY;
  const confirmedBackground = useSyncExternalStore(canvas.subscribe, getBackground, getBackground);
  const imageAt = useSyncExternalStore(canvas.subscribe, getImageAt, getImageAt);
  const confirmedOpacity = useSyncExternalStore(canvas.subscribe, getOpacity, getOpacity);
  const [isSending, setIsSending] = useState(false);
  const isTouch = useMediaQuery(COMPACT_SCREEN_QUERY);
  const toast = useToast();
  const t = useTexts(CANVAS_TEXTS);
  const { backgroundNames } = useTexts(DESIGN_TEXTS);

  // La frame `obsBackground` confirme le fond demandé, la frame `backgroundImageOpacity` l'opacité : le toast le dit (CDC 2026, Toasts).
  const [requestedBackground, setRequestedBackground] = useRequested<ObsBackground>(
    confirmedBackground,
    (confirmed) => toast("success", t.backgroundSaved(backgroundNames[confirmed])),
  );
  const [requestedOpacity, setRequestedOpacity] = useRequested<number>(confirmedOpacity, (confirmed) =>
    toast("success", t.imageOpacitySaved(t.opacityLabel(confirmed))),
  );

  const send = async (file: File): Promise<void> => {
    const prepared = await prepareBackgroundImage(file);
    if (!prepared.ok) {
      toast("error", t.imageFailure(prepared.error));
      return;
    }
    const sent = await uploadBackgroundImage({ login, canvasId, image: prepared.value });
    if (!sent.ok) {
      toast("error", t.imageFailure(sent.error));
      return;
    }
    // La frame suit seule : l'image arrive à toutes les pages.
    toast("success", t.imageSaved);
  };

  const clear = async (): Promise<void> => {
    const result = await clearCanvasBackgroundImageFn({ data: { canvasId } });
    if (!result.ok) {
      toast("error", t.imageFailure(result.error));
      return;
    }
    toast("success", t.imageCleared);
  };

  // Un envoi ou un retrait a un seul vol à la fois : les boutons attendent. Une erreur imprévue est journalisée, la page reste utilisable.
  const run = async (task: () => Promise<void>): Promise<void> => {
    setIsSending(true);
    try {
      await task();
    } catch (error) {
      console.error("image du fond : opération abandonnée", error);
      toast("error", t.imageFailure("failed"));
    } finally {
      setIsSending(false);
    }
  };

  const background = requestedBackground ?? confirmedBackground;
  return {
    background: {
      value: background,
      isTouch,
      onPick: (picked) => {
        setRequestedBackground(picked);
        canvas.setObsBackground(picked);
      },
    },
    image: {
      imageUrl: imageAt === undefined ? null : backgroundImagePath(login, imageAt),
      background,
      opacity: requestedOpacity ?? confirmedOpacity,
      isSending,
      onChooseFile: (file) => void run(() => send(file)),
      onClearImage: () => void run(clear),
      onPickOpacity: (picked) => {
        setRequestedOpacity(picked);
        canvas.setBackgroundImageOpacity(picked);
      },
    },
  };
}
