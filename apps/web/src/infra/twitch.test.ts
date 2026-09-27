import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwitchAuth } from "./twitch";

const twitch = createTwitchAuth({
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://liveplace.tv/auth/twitch/callback",
});

// Les réponses de Twitch, telles quelles : du texte en snake_case, que seul l'adaptateur lit (JOURNAL 2026-09-22).
const json = (body: string) => new Response(body, { status: 200 });

const USER =
  '{"data":[{"id":"1234","login":"fenysk","display_name":"Fenysk","profile_image_url":"https://avatar",' +
  '"email":"fenysk@example.com"}]}';
const MODERATORS_PAGE_1 =
  '{"data":[{"user_id":"21","user_login":"mod1","user_name":"Mod1"}],"pagination":{"cursor":"page-2"}}';
const MODERATORS_PAGE_2 =
  '{"data":[{"user_id":"22","user_login":"mod2","user_name":"Mod2"}],"pagination":{}}';
const BANNED =
  '{"data":[{"user_id":"31","user_login":"troll","user_name":"Troll","expires_at":""},' +
  '{"user_id":"32","user_login":"timeout","user_name":"TimeOut","expires_at":"2026-09-27T12:00:00Z"}],' +
  '"pagination":{}}';

// Twitch, joué par URL : l'échange du code, l'utilisateur, puis les pages de modérateurs et de bannis.
const stubTwitch = () => {
  const asked: { url: string; authorization: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    asked.push({
      url: `${url.pathname}${url.search}`,
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    if (url.pathname === "/oauth2/token") return json('{"access_token":"user-token"}');
    if (url.pathname === "/helix/users") return json(USER);
    if (url.pathname === "/helix/moderation/moderators")
      return json(url.searchParams.get("after") === "page-2" ? MODERATORS_PAGE_2 : MODERATORS_PAGE_1);
    if (url.pathname === "/helix/moderation/banned") return json(BANNED);
    return new Response("inconnu", { status: 404 });
  });
  return asked;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTwitchAuth (§10.1, JOURNAL 2026-09-27)", () => {
  // Ne demande que l'e-mail pour se connecter, et les droits de modération pour synchroniser
  it("asks only for the email to sign in, and for the moderation rights to sync", () => {
    const scopeOf = (url: string) => new URL(url).searchParams.get("scope");

    expect(scopeOf(twitch.authorizeUrl("state-1", "signIn"))).toBe("user:read:email");
    expect(scopeOf(twitch.authorizeUrl("state-1", "sync"))).toBe(
      "user:read:email moderation:read channel:moderate",
    );
  });

  // Lit la chaîne avec le jeton du retour : ses modérateurs page par page, et ses bans, définitifs ou non
  it("reads the channel with the token from the callback: its moderators page by page, and its bans", async () => {
    const asked = stubTwitch();

    const channel = await twitch.getChannelFromCode("code-1");

    expect(channel).toEqual({
      user: {
        userId: "1234",
        login: "fenysk",
        displayName: "Fenysk",
        avatarUrl: "https://avatar",
        email: "fenysk@example.com",
      },
      moderators: [
        { userId: "21", login: "mod1", displayName: "Mod1" },
        { userId: "22", login: "mod2", displayName: "Mod2" },
      ],
      bans: [
        { userId: "31", login: "troll", displayName: "Troll", isPermanent: true },
        { userId: "32", login: "timeout", displayName: "TimeOut", isPermanent: false },
      ],
    });
    expect(
      asked.filter(({ url }) => url.startsWith("/helix/moderation/moderators")).map(({ url }) => url),
    ).toEqual([
      "/helix/moderation/moderators?broadcaster_id=1234&first=100",
      "/helix/moderation/moderators?broadcaster_id=1234&first=100&after=page-2",
    ]);
    expect(new Set(asked.slice(1).map(({ authorization }) => authorization))).toEqual(
      new Set(["Bearer user-token"]),
    );
  });
});
