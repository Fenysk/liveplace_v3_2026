// La taille dynamique dans la section Canvas (Écart §5.3, JOURNAL 2026-10-28), branchée sur le store : la valeur affichée est la demandée
// tant que le `welcome` du gateway ne l'a pas confirmée, comme le fond ; un refus la rend à celle d'avant et le dit.

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { useTexts } from "../locale/use-locale";
import { CANVAS_TEXTS } from "./canvas-texts";
import { useRequested } from "./use-background-fields";

// `set` rend vrai quand le gateway a répondu : la fenêtre de confirmation (Écart §5.3, JOURNAL 2026-10-29) s'y attache pour se fermer.
export type DynamicSizeControl = {
  isOn: boolean;
  isBusy: boolean;
  set: (isOn: boolean) => Promise<boolean>;
};

export function useDynamicSizeField(canvas: CanvasStore): DynamicSizeControl {
  const getConfirmed = () => canvas.getView().isDynamicSize;
  const confirmed = useSyncExternalStore(canvas.subscribe, getConfirmed, getConfirmed);
  const toast = useToast();
  const t = useTexts(CANVAS_TEXTS);
  const [requested, setRequested] = useRequested<boolean>(confirmed, (isOn) =>
    toast("success", t.dynamicSizeSaved(isOn)),
  );

  return {
    isOn: requested ?? confirmed,
    isBusy: requested !== null,
    set: async (isOn) => {
      setRequested(isOn);
      const result = await canvas.setDynamicSize(isOn);
      if (!result.ok) {
        setRequested(null);
        toast("error", t.dynamicSizeFailed);
      }
      return result.ok;
    },
  };
}
