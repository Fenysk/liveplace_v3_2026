// `POST /kofi/webhook` : ce que Ko-fi poste à chaque don (JOURNAL 2026-11-03). Séparé de la route pour se tester sans routeur. Ni
// session, ni cookie, ni origine : Ko-fi n'est pas un navigateur, seul son jeton fait foi.

import { getBoundedBody } from "../../shared/bounded-body";
import { type KofiWebhookDeps, receiveKofiWebhook } from "../../usecase/kofi-webhook";

// Un don tient en moins de 2 Ko ; au-delà, ce n'est pas Ko-fi.
export const KOFI_BODY_MAX_BYTES = 16 * 1024;

const reply = (status: number): Response =>
  new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function kofiWebhookResponse(deps: KofiWebhookDeps, request: Request): Promise<Response> {
  const bytes = await getBoundedBody(request, KOFI_BODY_MAX_BYTES);
  if (!bytes) return reply(413);
  try {
    return reply((await receiveKofiWebhook(deps, new TextDecoder().decode(bytes))).status);
  } catch {
    // Jamais l'erreur : celle d'une bibliothèque peut citer ce qu'elle refuse, e-mail et nom compris. Ko-fi renvoie le message.
    console.error("kofi : don non enregistré, Ko-fi renverra le message");
    return reply(500);
  }
}
