// JOURNAL 2026-11-03 : ce que Ko-fi poste sur /kofi/webhook. Le web enregistre le don dans Convex ; le lien à un compte et le
// doublon (même `message_id`) s'y décident.

import type { Timestamp } from "@liveplace/domain";
import type { DonationStore, KofiWebhook, KofiWebhookRefusal } from "@liveplace/domain/ports";
import { type SupportMirrorDeps, writeSupportMirror } from "./support-mirror";

export type KofiWebhookDeps = {
  webhook: KofiWebhook;
  now: () => Timestamp;
  donations: Pick<DonationStore, "recordDonation" | "getSupport">;
  redis: SupportMirrorDeps["redis"];
};

// `200` pour un don, un doublon et un type ignoré : Ko-fi renvoie tant qu'il n'a pas son 200.
export type KofiWebhookAnswer = { status: 200 | 400 | 401 | 503 };

const REFUSED_STATUS: Record<KofiWebhookRefusal, 400 | 401 | 503> = {
  unconfigured: 503,
  unauthorized: 401,
  invalid: 400,
};

// Une panne de Convex lève : la route répond une erreur et Ko-fi renvoie le message.
export async function receiveKofiWebhook(deps: KofiWebhookDeps, body: string): Promise<KofiWebhookAnswer> {
  const read = deps.webhook.read(body, deps.now());
  if (!read.ok) return { status: REFUSED_STATUS[read.error] };
  if (read.value.kind === "donation") {
    const outcome = await deps.donations.recordDonation(read.value.donation);
    // Le badge arrive avec le don, sans attendre une connexion. Un renvoi de Ko-fi réécrit le miroir d'un don déjà relié.
    if (outcome.kind !== "unlinked" && outcome.user) await writeSupportMirror(deps, outcome.user);
  }
  return { status: 200 };
}
