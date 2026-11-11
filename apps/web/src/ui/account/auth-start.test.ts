import type { Session } from "@liveplace/domain";
import type { SessionVerifier } from "@liveplace/domain/ports";
import { describe, expect, it, vi } from "vitest";
import { Route } from "../../routes/auth/twitch";

// Le départ vers Twitch (§10.1) : un streamer déjà connecté arrive sur sa fresque, sans repasser par Twitch.
const handlers = Route.options.server?.handlers;
const get = typeof handlers === "object" ? handlers?.GET : undefined;

const TWITCH_URL = "https://id.twitch.tv/oauth2/authorize?state=fake";
const COOKIE_HEADER = "lp_session=signed";
const owner: Session = { userId: "42", login: "fenysk", displayName: "Fenysk" };

const start = async (query: string, verify: SessionVerifier["verify"]) => {
  const authorizeUrl = vi.fn(() => TWITCH_URL);
  const answer = await get?.({
    request: new Request(`http://liveplace.test/auth/twitch${query}`, { headers: { cookie: COOKIE_HEADER } }),
    context: { deps: { isSecure: false, verifier: { verify }, twitch: { authorizeUrl } } },
  } as never);
  if (!(answer instanceof Response)) throw new Error("le départ vers Twitch devait répondre");
  return { answer, authorizeUrl };
};

describe("the start of the Twitch sign-in on /auth/twitch (§10.1)", () => {
  // Quand le cookie de session est valide, le système l'envoie sur sa fresque, sans cookie d'aller ni appel à Twitch
  it("sends a signed-in owner to their canvas, without the cookie of the way out or Twitch", async () => {
    const verify = vi.fn(async () => owner);
    const { answer, authorizeUrl } = await start("", verify);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("/fenysk");
    expect(answer.headers.get("set-cookie")).toBeNull();
    expect(authorizeUrl).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledWith(COOKIE_HEADER);
  });

  // Quand le lien porte un `returnTo`, le système envoie le streamer connecté sur cette fresque
  it("sends a signed-in owner to the canvas of the returnTo", async () => {
    const { answer, authorizeUrl } = await start("?returnTo=/autre", async () => owner);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe("/autre");
    expect(authorizeUrl).not.toHaveBeenCalled();
  });

  // Un invité part chez Twitch, avec le cookie de l'aller posé
  it("sends a guest to Twitch with the cookie of the way out", async () => {
    const { answer, authorizeUrl } = await start("", async () => null);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe(TWITCH_URL);
    expect(answer.headers.get("set-cookie")).toContain("lp_oauth=");
    expect(authorizeUrl).toHaveBeenCalledWith(expect.any(String), "signIn");
  });

  // Quand le streamer connecté synchronise sa chaîne (`sync=1`), le système repart toujours chez Twitch
  it("sends a signed-in owner to Twitch when the channel is synced", async () => {
    const { answer, authorizeUrl } = await start("?sync=1", async () => owner);

    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toBe(TWITCH_URL);
    expect(answer.headers.get("set-cookie")).toContain("lp_oauth=");
    expect(authorizeUrl).toHaveBeenCalledWith(expect.any(String), "sync");
  });

  // Si le cookie ne se vérifie pas, le système journalise l'erreur et part chez Twitch comme pour un invité
  it("logs a session that cannot be verified and goes to Twitch", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { answer } = await start("", async () => {
        throw new Error("redis indisponible");
      });

      expect(answer.status).toBe(302);
      expect(answer.headers.get("location")).toBe(TWITCH_URL);
      expect(answer.headers.get("set-cookie")).toContain("lp_oauth=");
      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });
});
