// Le dessin seulement pendant le live dans la section Canvas (JOURNAL 2026-11-12), branché sur le store : la valeur affichée est la
// demandée tant que la frame `liveOnly` du gateway ne l'a pas confirmée, comme le fond.

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import type { LiveOnlyField } from "./canvas-settings";
import { CANVAS_TEXTS } from "./canvas-texts";
import { useRequested } from "./use-background-fields";

export function useLiveOnlyField(canvas: CanvasStore): LiveOnlyField {
  const getConfirmed = () => canvas.getView().params?.isLiveOnly === true;
  const confirmed = useSyncExternalStore(canvas.subscribe, getConfirmed, getConfirmed);
  const toast = useToast();
  const t = useTexts(CANVAS_TEXTS);
  const [requested, setRequested] = useRequested<boolean>(confirmed, (isOn) =>
    toast("success", t.liveOnlySaved(isOn)),
  );
  return {
    isOn: requested ?? confirmed,
    onToggle: (isOn) => {
      setRequested(isOn);
      canvas.setLiveOnly(isOn);
    },
  };
}
