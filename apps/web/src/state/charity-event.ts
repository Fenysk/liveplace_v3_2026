// Le mode événement côté page : l'état se recalcule par l'horloge, les dons attendent leur toast, un seul bouton doré réclame.

import { HOUR_MS } from "@liveplace/domain";
import {
  type CharityEventStatus,
  charityCountdownDelayMs,
  charityEventStatusOf,
} from "@liveplace/domain/charity-event";
import type { CharityEventState } from "@liveplace/protocol";

// Un minuteur ne dépasse pas 2^31 ms : au-delà, la page se réveille plus tôt et recalcule.
export const CHARITY_TIMER_MAX_MS = 2 ** 31 - 1;

// L'état de l'événement à l'horloge de cette page : sans réglage reçu, il est désactivé.
export const charityStatusOf = (state: CharityEventState | undefined, nowMs: number): CharityEventStatus =>
  state ? charityEventStatusOf(state, nowMs) : { kind: "off" };

// Le délai avant le prochain changement à l'écran : le compte à rebours pendant l'attente, puis, avant une fin, l'entrée dans sa dernière
// heure et ses secondes qui descendent. `null` : rien à attendre (en cours sans fin, ou terminé).
export function charityRecheckDelayMs(state: CharityEventState | undefined, nowMs: number): number | null {
  const status = charityStatusOf(state, nowMs);
  if (status.kind === "upcoming")
    return Math.min(charityCountdownDelayMs(status.startsAt - nowMs), CHARITY_TIMER_MAX_MS);
  if (status.kind === "running" && state?.endsAt !== undefined) {
    const left = Math.max(state.endsAt - nowMs, 0);
    return Math.min(
      left > HOUR_MS ? left - HOUR_MS + 1 : charityCountdownDelayMs(left),
      CHARITY_TIMER_MAX_MS,
    );
  }
  return null;
}

// Un don attend son tour : `id` est local à la page (celui du don est une chaîne), `cents`, `currency` et `pixels` ceux de la frame.
export type QueuedDonation = { id: number; donor: string; cents: number; currency: string; pixels: number };

// Un seul toast à la fois, dans l'ordre d'arrivée : le premier est montré.
export type DonationQueue = readonly QueuedDonation[];

export const enqueueDonation = (queue: DonationQueue, donation: QueuedDonation): DonationQueue => [
  ...queue,
  donation,
];

export const dropShownDonation = (queue: DonationQueue): DonationQueue => queue.slice(1);

export type ClaimChoice = "bonus" | "gauge" | null;

// Le bonus en attente passe avant le +1 de la jauge quand les deux sont possibles.
export function claimChoiceOf(bonusPending: number, gaugeClaimable: number): ClaimChoice {
  if (bonusPending > 0) return "bonus";
  return gaugeClaimable > 0 ? "gauge" : null;
}
