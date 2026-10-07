// Ce que chaque bouton de la pill Compte ouvre dans la fenêtre, selon le rôle (CDC 2026).

import type { Role } from "@liveplace/domain";
import type { AccountPillProps } from "./account-pill";
import { type AccountSection, SETTINGS_SECTION } from "./account-window";

type AccountPillOpeners = Pick<AccountPillProps, "onOpenAccount" | "onOpenSettings" | "onOpenModeration">;

export const accountPillOpeners = (
  role: Role | undefined,
  pendingReports: number | undefined,
  openWindow: (sectionId: AccountSection) => void,
): AccountPillOpeners => ({
  // Des signalements attendent : la photo du streamer ouvre Modération ; le modérateur a son bouton, sa photo reste Mon compte.
  onOpenAccount: () => openWindow(pendingReports && role !== "moderator" ? "moderation" : "account"),
  onOpenSettings: role === "owner" ? () => openWindow(SETTINGS_SECTION) : undefined,
  onOpenModeration: role === "moderator" ? () => openWindow("moderation") : undefined,
});
