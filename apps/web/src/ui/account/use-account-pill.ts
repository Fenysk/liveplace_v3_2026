// Ce que montre la pill Compte : qui est connecté, d'après la réponse du gateway au `hello`, et l'apparence choisie.

import { canModerate } from "@liveplace/domain";
import { useSyncExternalStore } from "react";
import type { CanvasStore, CanvasView } from "../../state/canvas-store";
import type { ProfileUser } from "../design/profile";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { audiencesOf, type ReleaseAudience } from "../release-notes/release-notes";
import { useHasUnreadReleases } from "../release-notes/use-release-notes";
import type { AccountIdentity, AccountPillProps } from "./account-pill";
import { signInHref, signOutHref } from "./auth-links";

// §10.4 : son profil dit aussi s'il est en live sur Twitch.
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
  | "onOpenReleaseNotes"
  | "isCompact"
  | "isDocked"
  | "isVisible"
> & {
  signOutHref: string;
  audiences: readonly ReleaseAudience[]; // les Nouveautés que ce rôle lit sur cette fresque : la section en reprend la liste
  windowUser: ProfileUser | undefined; // qui a Mon compte dans la fenêtre : un invité n'a que Nouveautés
};

export function useAccountPillProps(canvas: CanvasStore, login: string): AccountProps {
  const view = useSyncExternalStore(canvas.subscribe, canvas.getView, canvas.getView);
  const appearanceChoice = useAppearanceChoice();
  const audiences = audiencesOf(view.role);
  const hasUnreadReleaseNotes = useHasUnreadReleases(audiences);
  const identity = toIdentity(view);
  return {
    identity,
    windowUser: identity.kind === "signedIn" ? identity.user : undefined,
    signInHref: signInHref(login),
    signOutHref: signOutHref(login),
    appearanceChoice,
    onPickAppearance: pickAppearance,
    pendingReports: view.role && canModerate(view.role) ? view.reportCount : 0,
    hasUnreadReleaseNotes,
    audiences,
  };
}
