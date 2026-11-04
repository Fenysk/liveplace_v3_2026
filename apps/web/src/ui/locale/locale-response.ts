// `/auth/locale` : le serveur pose et relit le cookie `lp_locale`, que la page ne touche plus (JOURNAL 2026-11-04) : `HttpOnly`
// l'y cache. Séparé de la route pour se tester sans routeur.

import { cookieValue } from "@liveplace/shared";
import { getBoundedBody } from "../../shared/bounded-body";
import { isFromOurPage } from "../../shared/same-origin";
import { LOCALE_COOKIE, type Locale, localeCookie, toLocale } from "./locale";

export type LocaleResponseDeps = {
  publicUrl: string; // l'adresse du site : derrière Traefik, la requête arrive en http, c'est elle qui dit l'origine
  isSecure: boolean;
};

export type LocaleRefusal = "forbidden" | "invalid";

const BODY_MAX_BYTES = 256; // `{"locale":"en"}` en fait 15

const reply = (
  status: number,
  body: { ok: true; locale: Locale | null } | { ok: false; error: LocaleRefusal },
  headers: HeadersInit = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const localeOfBody = async (request: Request): Promise<Locale | undefined> => {
  const bytes = await getBoundedBody(request, BODY_MAX_BYTES);
  if (!bytes) return undefined;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof body === "object" && body !== null && "locale" in body && typeof body.locale === "string"
      ? toLocale(body.locale)
      : undefined;
  } catch {
    return undefined; // pas du JSON
  }
};

// `POST` : le choix de la page. Une langue hors de la liste ne pose rien.
export async function pickLocaleResponse(
  { publicUrl, isSecure }: LocaleResponseDeps,
  request: Request,
): Promise<Response> {
  if (!isFromOurPage(request, publicUrl)) return reply(403, { ok: false, error: "forbidden" });
  const locale = await localeOfBody(request);
  if (!locale) return reply(400, { ok: false, error: "invalid" });
  return reply(200, { ok: true, locale }, { "set-cookie": localeCookie(locale, isSecure) });
}

// `GET` : la langue du cookie, `null` sans cookie. Une page reprise du cache au retour arrière date d'avant le dernier choix.
export function savedLocaleResponse(request: Request): Response {
  const cookie = cookieValue(request.headers.get("cookie") ?? undefined, LOCALE_COOKIE);
  return reply(200, { ok: true, locale: toLocale(cookie) ?? null });
}
