import { describe, expect, it } from "vitest";
import { LOCALES, resolveLocale } from "./locale";
import { pickLocaleResponse, savedLocaleResponse } from "./locale-response";

const PUBLIC_URL = "https://liveplace.tv";
const deps = { publicUrl: PUBLIC_URL, isSecure: true };

const post = (body: string, origin: string | null = PUBLIC_URL, cookie?: string) =>
  new Request(`${PUBLIC_URL}/auth/locale`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin === null ? {} : { origin }),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body,
  });

describe("POST /auth/locale (JOURNAL 2026-11-04)", () => {
  // Le serveur pose le cookie : HttpOnly, SameSite=Lax, Secure en https, valable un an sur tout le site
  it("sets the language cookie HttpOnly, SameSite=Lax and Secure in https, for a year", async () => {
    const response = await pickLocaleResponse(deps, post('{"locale":"en"}'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, locale: "en" });
    expect(response.headers.get("set-cookie")).toBe(
      "lp_locale=en; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // Hors https (le poste, une bêta en http), le cookie ne porte pas `Secure`
  it("sets the cookie without Secure when the site is not served in https", async () => {
    const response = await pickLocaleResponse({ ...deps, isSecure: false }, post('{"locale":"fr"}'));

    expect(response.headers.get("set-cookie")).toBe(
      "lp_locale=fr; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax",
    );
  });

  // Le cookie posé est celui que le serveur relit pour rendre la page suivante, quelle que soit la langue du navigateur
  it("sets a cookie that the server reads back as the same language", async () => {
    for (const locale of LOCALES) {
      const response = await pickLocaleResponse(deps, post(JSON.stringify({ locale })));
      const cookie = response.headers.get("set-cookie")?.split(";")[0];

      expect(resolveLocale({ cookieHeader: cookie, preferenceHeader: "de" })).toBe(locale);
    }
  });

  // Une langue hors de la liste, un corps qui n'est pas du JSON ou sans langue, ou trop gros : 400, aucun cookie
  it("refuses a language outside the list, a body that is not JSON, and an oversized body, setting no cookie", async () => {
    const bodies = [
      '{"locale":"de"}',
      '{"locale":"EN"}',
      '{"locale":["en"]}',
      '{"language":"en"}',
      "locale=en",
      "",
      "null",
      JSON.stringify({ locale: "en", padding: "x".repeat(1_000) }),
    ];
    for (const body of bodies) {
      const response = await pickLocaleResponse(deps, post(body));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "invalid" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  // Une requête d'un autre site, d'un autre sous-domaine ou sans `Origin` ne change pas la langue
  it("refuses a request that does not come from our page, setting no cookie", async () => {
    for (const origin of [null, "https://evil.example", "https://beta.liveplace.tv", "http://liveplace.tv"]) {
      const response = await pickLocaleResponse(deps, post('{"locale":"en"}', origin));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("GET /auth/locale (JOURNAL 2026-11-04)", () => {
  const get = (cookie?: string) =>
    new Request(`${PUBLIC_URL}/auth/locale`, { headers: cookie === undefined ? {} : { cookie } });

  // La page ne lit pas le cookie HttpOnly : le serveur lui dit quelle langue il a retenue, parmi les autres cookies
  it("tells the language of the cookie among the others, and stores nothing", async () => {
    const response = savedLocaleResponse(get("lp_session=abc; lp_locale=en; theme=dark"));

    expect(await response.json()).toEqual({ ok: true, locale: "en" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  // Sans cookie, ou avec une langue inconnue, le serveur ne dit aucune langue : la page garde la sienne
  it("tells no language when the cookie is missing or holds an unknown one", async () => {
    for (const cookie of [undefined, "lp_session=abc", "lp_locale=de"]) {
      expect(await savedLocaleResponse(get(cookie)).json()).toEqual({ ok: true, locale: null });
    }
  });
});
