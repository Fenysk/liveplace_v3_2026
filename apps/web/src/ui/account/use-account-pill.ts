// Ce que montre la pill Compte : qui est connecté, d'après la réponse du gateway au `hello`, et l'apparence choisie.

import { canModerate } from "@liveplace/domain";
import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import type { AccountIdentity, AccountPillProps } from "./account-pill";
import { signInHref, signOutHref } from "./auth-links";

// Écart §4 (JOURNAL 2026-10-07) : son profil dit aussi s'il est en live sur Twitch.
export const toIdentity = ({
  role,
  userId,
  login,
  displayName,
  avatarUrl,
  twitchLive,
}: Pick<
  CanvasView,
  "role" | "userId" | "login" | "displayName" | "avatarUrl" | "twitchLive"
>): AccountIdentity => {
  if (!role) return { kind: "unknown" };
  if (!userId || !login || !displayName) return { kind: "guest" };
  return { kind: "signedIn", user: { displayName, login, avatarUrl, twitchLive } };
};

// Ce que la pill Compte montre, et ce que la fenêtre ouverte par elle en reprend.
export type AccountProps = Omit<
  AccountPillProps,
  | "onOpenAccount"
  | "onOpenSettings"
  | "onOpenModeration"
  | "onOpenDeveloper"
  | "isCompact"
  | "isDocked"
  | "isVisible"
> & {
  signOutHref: string;
};

export function useAccountPillProps(canvas: CanvasStore, login: string): AccountProps {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const appearanceChoice = useAppearanceChoice();
  return {
    identity: toIdentity(view),
    signInHref: signInHref(login),
    signOutHref: signOutHref(login),
    appearanceChoice,
    onPickAppearance: pickAppearance,
    pendingReports: view.role && canModerate(view.role) ? view.reportCount : 0,
  };
}
