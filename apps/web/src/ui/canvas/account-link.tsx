// Se connecter ou se déconnecter, d'après la réponse du gateway au `hello` : le web affiche, le gateway décide (§10.3).

import { useSyncExternalStore } from "react";
import type { CanvasStore } from "../../state/canvas-store";
import { Pill } from "../design/pill";

const LINK_STYLE = { color: "#c9b6ff" };

export const AccountLink = ({ store, login }: { store: CanvasStore; login: string }) => {
  const view = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  // Écart §10.1 (JOURNAL 2026-09-22) : après Twitch, on revient sur ce canvas.
  const returnTo = encodeURIComponent(`/${login}`);
  // La pill Compte attend le rôle : jamais de bulle vide.
  if (!view.role) return null;
  return (
    <Pill dock="tr">
      {view.role === "guest" ? (
        <a href={`/auth/twitch?returnTo=${returnTo}`} style={LINK_STYLE}>
          Se connecter avec Twitch
        </a>
      ) : (
        <p style={{ margin: 0, fontSize: 14 }}>
          {view.displayName} ·{" "}
          <a href={`/auth/signout?returnTo=${returnTo}`} style={LINK_STYLE}>
            Se déconnecter
          </a>
        </p>
      )}
    </Pill>
  );
};
