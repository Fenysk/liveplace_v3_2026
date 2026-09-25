// Ce que montre la pill Compte : qui est connecté, d'après la réponse du gateway au `hello`, et le thème choisi.

import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import { pickTheme, useThemeChoice } from "../design/use-theme";
import type { AccountIdentity, AccountPillProps } from "./account-pill";
import { signInHref, signOutHref } from "./auth-links";

const toIdentity = ({ role, userId, login, displayName, avatarUrl }: CanvasView): AccountIdentity => {
  if (!role) return { kind: "unknown" };
  if (!userId || !login || !displayName) return { kind: "guest" };
  return { kind: "signedIn", user: { displayName, login, avatarUrl } };
};

// Ce que la pill Compte montre, et ce que la fenêtre ouverte par elle en reprend.
export type AccountProps = Omit<AccountPillProps, "onOpenAccount" | "isCompact" | "isDocked"> & {
  signOutHref: string;
};

export function useAccountPillProps(canvas: CanvasStore, login: string): AccountProps {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const themeChoice = useThemeChoice();
  return {
    identity: toIdentity(view),
    signInHref: signInHref(login),
    signOutHref: signOutHref(login),
    themeChoice,
    onPickTheme: pickTheme,
  };
}
