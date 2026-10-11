// La section Vue OBS, branchée sur le store (JOURNAL 2026-09-25) : le délai choisi part au gateway, et la valeur
// affichée est la demandée tant que la frame `obsDelay` ne l'a pas confirmée.

import { OBS_DELAY_MS } from "@liveplace/domain";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { useToast } from "../design/toast";
import { useLocale, useTexts } from "../locale/use-locale";
import { obsDelayLabel } from "./obs-delay-label";
import { ObsSettings } from "./obs-settings";
import { OBS_TEXTS } from "./obs-texts";

type ObsTabProps = { canvas: CanvasStore; login: string; onCopy: () => void };

export const ObsTab = ({ canvas, login, onCopy }: ObsTabProps) => {
  const getConfirmed = () => canvas.getView().params?.obsDelayMs ?? OBS_DELAY_MS;
  const confirmed = useSyncExternalStore(canvas.subscribe, getConfirmed, getConfirmed);
  const [requested, setRequested] = useState<number | null>(null);
  const toast = useToast();
  const locale = useLocale();
  const t = useTexts(OBS_TEXTS);
  // La frame `obsDelay` confirme le cran demandé : le toast le dit (CDC 2026, Toasts).
  useEffect(() => {
    if (requested !== confirmed) return;
    setRequested(null);
    toast("success", t.delaySaved(obsDelayLabel(confirmed, locale)));
  }, [requested, confirmed, toast, t, locale]);
  // Montée seulement quand la fenêtre s'ouvre sur cette section : toujours dans le navigateur.
  const url = `${window.location.origin}/${login}`;
  return (
    <ObsSettings
      address={url.replace(/^https?:\/\//, "")}
      url={url}
      onCopy={onCopy}
      obsDelayMs={requested ?? confirmed}
      onPickDelay={(obsDelayMs) => {
        setRequested(obsDelayMs);
        canvas.setObsDelay(obsDelayMs);
      }}
    />
  );
};
