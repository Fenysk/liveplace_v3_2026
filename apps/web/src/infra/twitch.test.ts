import { createHmac } from "node:crypto";
import type { TwitchWebhookMessage } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwitchAuth, createTwitchEventSub, createTwitchWebhook } from "./twitch";

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

describe("createTwitchWebhook (JOURNAL 2026-09-27)", () => {
  const secret = "eventsub-secret";
  const sentAt = Date.parse("2026-09-27T12:00:00Z");
  const webhook = createTwitchWebhook(secret);

  // Un message tel que Twitch l'envoie : signé par le secret partagé, sur l'id, l'heure et le corps
  const messageOf = (type: string, body: string, signedWith = secret): TwitchWebhookMessage => {
    const id = "message-1";
    const timestamp = "2026-09-27T12:00:00Z";
    const hmac = createHmac("sha256", signedWith)
      .update(id + timestamp + body)
      .digest("hex");
    return { id, timestamp, signature: `sha256=${hmac}`, type, body };
  };

  const BAN =
    '{"subscription":{"type":"channel.ban"},"event":{"broadcaster_user_id":"1234","user_id":"31",' +
    '"user_login":"troll","user_name":"Troll","is_permanent":true}}';
  const TIMEOUT = BAN.replace('"is_permanent":true', '"is_permanent":false');
  const MODERATOR_REMOVE =
    '{"subscription":{"type":"channel.moderator.remove"},"event":{"broadcaster_user_id":"1234",' +
    '"user_id":"21","user_login":"mod1","user_name":"Mod1"}}';
  const CHALLENGE = '{"challenge":"pogchamp-kappa-360noscope","subscription":{"type":"channel.ban"}}';
  const REVOCATION =
    '{"subscription":{"type":"channel.ban","status":"authorization_revoked",' +
    '"condition":{"broadcaster_user_id":"1234"}}}';

  // Lit un ban définitif, un timeout et un modérateur retiré, signés par le bon secret
  it("reads a permanent ban, a timeout and a removed moderator, signed with the right secret", () => {
    const troll = { userId: "31", login: "troll", displayName: "Troll" };

    expect(webhook.read(messageOf("notification", BAN), sentAt)).toEqual({
      kind: "ban",
      broadcasterId: "1234",
      user: troll,
      isPermanent: true,
    });
    expect(webhook.read(messageOf("notification", TIMEOUT), sentAt)).toMatchObject({ isPermanent: false });
    expect(webhook.read(messageOf("notification", MODERATOR_REMOVE), sentAt)).toEqual({
      kind: "moderator",
      broadcasterId: "1234",
      user: { userId: "21", login: "mod1", displayName: "Mod1" },
      isModerator: false,
    });
  });

  // Lit la vérification d'un abonnement et la révocation des droits
  it("reads the verification of a subscription and the revocation of the rights", () => {
    expect(webhook.read(messageOf("webhook_callback_verification", CHALLENGE), sentAt)).toEqual({
      kind: "verification",
      challenge: "pogchamp-kappa-360noscope",
    });
    expect(webhook.read(messageOf("revocation", REVOCATION), sentAt)).toEqual({
      kind: "revocation",
      broadcasterId: "1234",
    });
  });

  // Refuse une signature d'un autre secret, un corps retouché, et un message de plus de 10 minutes
  it("refuses a signature from another secret, a tampered body, and a message older than 10 minutes", () => {
    const tampered = { ...messageOf("notification", BAN), body: BAN.replace("31", "32") };

    expect(webhook.read(messageOf("notification", BAN, "another-secret"), sentAt)).toBeNull();
    expect(webhook.read(tampered, sentAt)).toBeNull();
    expect(webhook.read(messageOf("notification", BAN), sentAt + 11 * 60_000)).toBeNull();
  });
});

describe("createTwitchEventSub (JOURNAL 2026-09-27)", () => {
  const options = {
    clientId: "client-id",
    clientSecret: "client-secret",
    callbackUrl: "https://liveplace.tv/twitch/eventsub",
    secret: "eventsub-secret",
    isBeta: false,
  };

  // Twitch, joué par URL : le jeton de l'application, puis les abonnements de la chaîne.
  const stubSubscriptions = (existing: string) => {
    const created: unknown[] = [];
    const cleared: string[] = [];
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      asked.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/oauth2/token") return json('{"access_token":"app-token","expires_in":3600}');
      if (url.pathname === "/helix/eventsub/subscriptions" && init?.method === "POST") {
        created.push(String(init.body));
        return new Response("{}", { status: 202 });
      }
      if (url.pathname === "/helix/eventsub/subscriptions" && init?.method === "DELETE") {
        cleared.push(url.searchParams.get("id") ?? "");
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/helix/eventsub/subscriptions") return json(existing);
      return new Response("inconnu", { status: 404 });
    });
    return { created, cleared, asked };
  };

  // Abonne la chaîne à ce qui lui manque, par webhook signé, avec un seul jeton d'application
  it("subscribes the channel to what it lacks, by signed webhook, with a single app token", async () => {
    const { created, asked } = stubSubscriptions(
      '{"data":[{"id":"ban","type":"channel.ban","status":"enabled","transport":{"callback":"https://liveplace.tv/twitch/eventsub"}},' +
        '{"id":"unban","type":"channel.unban","status":"authorization_revoked",' +
        '"transport":{"callback":"https://liveplace.tv/twitch/eventsub"}}],"pagination":{}}',
    );

    await createTwitchEventSub(options).subscribeToModeration("1234");

    // Le corps tel que Twitch le reçoit : du texte en snake_case.
    const transport = `{"method":"webhook","callback":"${options.callbackUrl}","secret":"${options.secret}"}`;
    expect(created).toEqual(
      ["channel.unban", "channel.moderator.add", "channel.moderator.remove"].map(
        (type) =>
          `{"type":"${type}","version":"1","condition":{"broadcaster_user_id":"1234"},"transport":${transport}}`,
      ),
    );
    expect(asked.filter((line) => line === "POST /oauth2/token")).toHaveLength(1);
  });

  // Reprend un abonnement de la chaîne parti vers une autre adresse : Twitch n'en garde qu'un par type (JOURNAL 2026-10-05)
  it("takes back a subscription of the channel that points to another address", async () => {
    const { created, cleared } = stubSubscriptions(
      '{"data":[{"id":"from-beta","type":"channel.ban","status":"enabled",' +
        '"transport":{"callback":"https://beta.liveplace.tv/twitch/eventsub"}},' +
        '{"id":"ours","type":"channel.unban","status":"enabled",' +
        '"transport":{"callback":"https://liveplace.tv/twitch/eventsub"}}],"pagination":{}}',
    );

    await createTwitchEventSub(options).subscribeToModeration("1234");

    expect(cleared).toEqual(["from-beta"]);
    expect(created.map((body) => JSON.parse(String(body)).type)).toEqual([
      "channel.ban",
      "channel.moderator.add",
      "channel.moderator.remove",
    ]);
  });

  // Une bêta ne demande rien à Twitch : elle prendrait l'abonnement de la prod (JOURNAL 2026-10-05)
  it("asks Twitch nothing from a beta slot, which would take the subscription away from production", async () => {
    const { asked } = stubSubscriptions('{"data":[],"pagination":{}}');
    const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createTwitchEventSub({
      ...options,
      callbackUrl: "https://beta.liveplace.tv/twitch/eventsub",
      isBeta: true,
    }).subscribeToModeration("1234");

    expect(asked).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  // Ne demande rien à Twitch quand l'adresse n'est pas publique en https : le poste de développement
  it("asks Twitch nothing when the address is not public https: the development machine", async () => {
    const { asked } = stubSubscriptions('{"data":[],"pagination":{}}');
    const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createTwitchEventSub({
      ...options,
      callbackUrl: "http://localhost:3000/twitch/eventsub",
    }).subscribeToModeration("1234");

    expect(asked).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
