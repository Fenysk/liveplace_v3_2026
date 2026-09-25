// La section Vue OBS, branchée sur le store (JOURNAL 2026-09-25) : le délai choisi part au gateway, et la valeur
// affichée est la demandée tant que la frame `obsDelay` ne l'a pas confirmée.

import { OBS_DELAY_MS } from "@liveplace/domain";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { ObsSettings } from "./obs-settings";

type ObsTabProps = { canvas: CanvasStore; login: string };

export const ObsTab = ({ canvas, login }: ObsTabProps) => {
  const getConfirmed = () => canvas.getView().params?.obsDelayMs ?? OBS_DELAY_MS;
  const confirmed = useSyncExternalStore(canvas.subscribe, getConfirmed, getConfirmed);
  const [requested, setRequested] = useState<number | null>(null);
  useEffect(() => {
    if (requested === confirmed) setRequested(null);
  }, [requested, confirmed]);
  // Montée seulement quand la fenêtre s'ouvre sur cette section : toujours dans le navigateur.
  const url = `${window.location.origin}/${login}`;
  return (
    <ObsSettings
      address={url.replace(/^https?:\/\//, "")}
      url={url}
      obsDelayMs={requested ?? confirmed}
      onPickDelay={(obsDelayMs) => {
        setRequested(obsDelayMs);
        canvas.setObsDelay(obsDelayMs);
      }}
    />
  );
};
