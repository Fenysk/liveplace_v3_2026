// `POST /auth/delete-account` : le bouton de Mon compte (CDC §8). Séparé de la route pour se tester sans routeur.

import { SESSION_COOKIE } from "@liveplace/domain";
import { serializeCookie } from "@liveplace/shared";
import { isFromOurPage } from "../../shared/same-origin";
import type { DeleteAccountReason } from "../../state/account-deletion";
import { type DeleteOwnAccountDeps, deleteOwnAccount } from "../../usecase/delete-own-account";

export type DeleteAccountResponseDeps = {
  deletion: DeleteOwnAccountDeps;
  publicUrl: string; // l'adresse du site : derrière Traefik, la requête arrive en http, c'est elle qui dit l'origine
  isSecure: boolean;
};

const STATUSES: Record<DeleteAccountReason, number> = { unauthenticated: 401, failed: 502, forbidden: 403 };

const reply = (body: { ok: true } | { ok: false; error: DeleteAccountReason }, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status: body.ok ? 200 : STATUSES[body.error],
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

export async function deleteAccountResponse(
  { deletion, publicUrl, isSecure }: DeleteAccountResponseDeps,
  request: Request,
): Promise<Response> {
  if (!isFromOurPage(request, publicUrl)) return reply({ ok: false, error: "forbidden" });
  const result = await deleteOwnAccount(deletion, request.headers.get("cookie") ?? undefined);
  if (!result.ok) return reply({ ok: false, error: result.error });
  // Le cookie part dans la même réponse : `lp_locale` reste, c'est le choix de la langue.
  return reply({ ok: true }, { "set-cookie": serializeCookie(SESSION_COOKIE, "", 0, isSecure) });
}
