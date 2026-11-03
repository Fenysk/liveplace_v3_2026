// JOURNAL 2026-11-03 : ce que lisent Mon compte et la section Badges de la fenêtre Développeur, tout dans Convex (une donnée rare, lue
// à l'ouverture) ; le lien à la main écrit aussi le miroir du compte, par le même écrivain que la connexion.

import { isDeveloper, type Timestamp } from "@liveplace/domain";
import type {
  DonationLinkRefusal,
  DonationStore,
  SessionVerifier,
  WaitingDonation,
} from "@liveplace/domain/ports";
import {
  countSupportHolders,
  type SupportTitle,
  supportTitle,
  supportWindowStart,
} from "@liveplace/domain/support";
import type { Result } from "@liveplace/shared";
import { withOwnerSession } from "./owner-session";
import { type SupportMirrorDeps, writeSupportMirror } from "./support-mirror";

// Mon compte : le titre de son Soutien, expiré ou non (CDC des badges §3), jamais une date. `null` : aucun don relié.
export async function getMySupportTitle(
  deps: Pick<DonationStore, "getSupport">,
  userId: string,
): Promise<Result<SupportTitle | null, never>> {
  const summary = await deps.getSupport(userId);
  return { ok: true, value: summary ? supportTitle(summary.lifetimeCents) : null };
}

// `holders` : les comptes dont le Soutien court encore. `waiting` : les dons que le développeur relie, jamais avec leur montant.
export type BadgesReport = { holders: number; waiting: WaitingDonation[] };

export async function getBadgesReport(
  donations: Pick<DonationStore, "getLastDonationDates" | "listWaitingDonations">,
  nowMs: Timestamp,
): Promise<Result<BadgesReport, never>> {
  const [lastDonations, waiting] = await Promise.all([
    donations.getLastDonationDates(supportWindowStart(nowMs)),
    donations.listWaitingDonations(),
  ]);
  return { ok: true, value: { holders: countSupportHolders(lastDonations, nowMs), waiting } };
}

// Relier : le compte se trouve par son pseudo, puis son miroir prend le titre tout de suite. Un pseudo vide est un pseudo inconnu.
export async function linkWaitingDonation(
  deps: SupportMirrorDeps & { donations: Pick<DonationStore, "linkDonation" | "getSupport"> },
  donationId: string,
  login: string,
): Promise<Result<void, DonationLinkRefusal>> {
  const linked = await deps.donations.linkDonation(donationId, login);
  if (!linked.ok) return linked;
  await writeSupportMirror(deps, linked.value);
  return { ok: true, value: undefined };
}

// Le développeur seul : le rôle se vérifie ici, sur la session, comme pour l'activité et la capacité côté gateway (§10.3).
export const withDeveloperSession = <Value, Refusal extends string>(
  verifier: SessionVerifier,
  cookieHeader: string | undefined,
  run: () => Promise<Result<Value, Refusal>>,
): Promise<Result<Value, Refusal | "unauthenticated" | "forbidden">> =>
  withOwnerSession<Value, Refusal | "forbidden">(verifier, cookieHeader, (userId) =>
    isDeveloper(userId) ? run() : Promise.resolve({ ok: false, error: "forbidden" }),
  );
