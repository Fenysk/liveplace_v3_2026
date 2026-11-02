import type { Session } from "@liveplace/domain";
import type { Result } from "@liveplace/shared";
import { describe, expect, it } from "vitest";
import type { BeganDeletion, DeleteAccountRequest } from "../../usecase/delete-account";
import { type DeleteAccountResponseDeps, deleteAccountResponse } from "./delete-account-response";

const PUBLIC_URL = "https://liveplace.tv";
const session: Session = { userId: "1234", login: "fenysk", displayName: "Fenysk" };

type Setup = { session?: Session | null; begin?: Result<BeganDeletion, "failed">; isSecure?: boolean };

const setup = (options: Setup = {}) => {
  const requests: DeleteAccountRequest[] = [];
  const deps: DeleteAccountResponseDeps = {
    deletion: {
      verifier: { verify: async () => (options.session === undefined ? session : options.session) },
      beginDeletion: async (request) => {
        requests.push(request);
        return (
          options.begin ?? { ok: true, value: { done: Promise.resolve({ ok: true, value: undefined }) } }
        );
      },
      waitMs: 1_000,
    },
    publicUrl: PUBLIC_URL,
    isSecure: options.isSecure ?? true,
  };
  return { deps, requests };
};

const post = (origin: string | null, cookie = "lp_session=abc; lp_locale=en") =>
  new Request(`${PUBLIC_URL}/auth/delete-account`, {
    method: "POST",
    headers: { cookie, ...(origin === null ? {} : { origin }) },
  });

describe("POST /auth/delete-account (CDC §8, JOURNAL 2026-11-02)", () => {
  // Quand l'effacement réussit, la réponse efface le cookie de session, jamais celui de la langue, et ne se garde nulle part
  it("clears the session cookie in the answer, never the language one, and is stored nowhere", async () => {
    const { deps, requests } = setup();

    const response = await deleteAccountResponse(deps, post(PUBLIC_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toBe(
      "lp_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    );
    expect(response.headers.get("set-cookie")).not.toContain("lp_locale");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requests).toEqual([{ userId: "1234", trigger: "button" }]);
  });

  // Hors https (le poste, une bêta en http), le cookie effacé ne porte pas `Secure`
  it("clears the cookie without Secure when the site is not served in https", async () => {
    const { deps } = setup({ isSecure: false });

    const response = await deleteAccountResponse(deps, post(PUBLIC_URL));

    expect(response.headers.get("set-cookie")).toBe("lp_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });

  // Sans session, la réponse refuse, sans effacer le cookie ni rien inscrire
  it("refuses without a session: 401, no cookie touched, nothing registered", async () => {
    const { deps, requests } = setup({ session: null });

    const response = await deleteAccountResponse(deps, post(PUBLIC_URL, "lp_locale=fr"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthenticated" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(requests).toEqual([]);
  });

  // Une erreur avant l'inscription laisse le compte et son cookie : la fenêtre le dit, la personne peut réessayer
  it("keeps the account and its cookie when nothing could be registered", async () => {
    const { deps } = setup({ begin: { ok: false, error: "failed" } });

    const response = await deleteAccountResponse(deps, post(PUBLIC_URL));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: "failed" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  // Depuis un autre site, un autre sous-domaine du même site, ou sans `Origin`, la requête est refusée avant toute lecture de la session
  it("refuses a request that does not come from our page, before reading the session", async () => {
    for (const origin of [
      "https://evil.example",
      "https://beta.liveplace.tv",
      "http://liveplace.tv",
      "https://liveplace.tv.evil.example",
      "null",
      null,
    ]) {
      const { deps, requests } = setup();

      const response = await deleteAccountResponse(deps, post(origin));

      expect(response.status, String(origin)).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(requests).toEqual([]);
    }
  });

  // L'adresse publique avec un chemin ou une barre finale compare quand même l'origine seule
  it("compares the origin alone when the public address carries a path or a trailing slash", async () => {
    const { deps } = setup();

    const response = await deleteAccountResponse({ ...deps, publicUrl: `${PUBLIC_URL}/` }, post(PUBLIC_URL));

    expect(response.status).toBe(200);
  });
});
