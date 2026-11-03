// JOURNAL 2026-11-03 : ce que le miroir `user:` garde du Soutien d'un compte, calculé depuis ses dons reliés dans Convex. Le gateway
// ne lit jamais Convex (D-02) : le web écrit le titre et la fin, le gateway les compare à l'heure à chaque affichage.

import type { User } from "@liveplace/domain";
import type { SupportMirror } from "@liveplace/domain/badges";
import type { DonationStore, SignInWrites, SupportSummary } from "@liveplace/domain/ports";
import { supportEndsAt, supportTitle } from "@liveplace/domain/support";

// `null` : aucun don relié, rien à écrire.
export const toSupportMirror = (summary: SupportSummary | null): SupportMirror | null => {
  if (!summary) return null;
  const title = supportTitle(summary.lifetimeCents);
  return title ? { title, endsAt: supportEndsAt(summary.lastDonatedAt) } : null;
};

export type SupportMirrorDeps = {
  donations: Pick<DonationStore, "getSupport">;
  redis: Pick<SignInWrites, "setUser">;
};

// Le seul écrivain du Soutien dans le miroir : la connexion, un don relié à sa réception et le lien à la main passent tous par ici,
// avec le nom et la photo que Convex garde du compte.
export const writeSupportMirror = async (deps: SupportMirrorDeps, user: User): Promise<void> => {
  await deps.redis.setUser(user, toSupportMirror(await deps.donations.getSupport(user.userId)));
};
