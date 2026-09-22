// Se connecter ou se déconnecter, d'après la réponse du gateway au `hello` : le web affiche, le gateway décide (§10.3).

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";

const LINK_STYLE = { color: "#c9b6ff" };

export const AccountLink = ({ store, login }: { store: CanvasStore; login: string }) => {
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  // Écart §10.1 (JOURNAL 2026-09-22) : après Twitch, on revient sur ce canvas.
  const returnTo = encodeURIComponent(`/${login}`);
  if (!view.role) return null;
  if (view.role === "guest") {
    return (
      <a href={`/auth/twitch?returnTo=${returnTo}`} style={LINK_STYLE}>
        Se connecter avec Twitch
      </a>
    );
  }
  return (
    <p style={{ margin: 0, fontSize: 14 }}>
      {view.displayName} ·{" "}
      <a href={`/auth/signout?returnTo=${returnTo}`} style={LINK_STYLE}>
        Se déconnecter
      </a>
    </p>
  );
};
