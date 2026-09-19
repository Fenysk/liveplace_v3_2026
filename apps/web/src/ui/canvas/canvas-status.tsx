// Une ligne d'état sous le canvas : connexion, version, rôle, et le dernier refus du gateway.

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";

const STATUS_LABELS = { connecting: "Connexion…", live: "En direct", closed: "Déconnecté" } as const;

export const CanvasStatus = ({ store }: { store: CanvasStore }) => {
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const parts = [STATUS_LABELS[view.status], `version ${view.version}`];
  if (view.role) parts.push(`rôle ${view.role}`);
  if (view.lastError) parts.push(`refusé : ${view.lastError}`);
  return <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>{parts.join(" · ")}</p>;
};
