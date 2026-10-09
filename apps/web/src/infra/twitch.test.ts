import { createHmac } from "node:crypto";
import type { TwitchWebhookMessage } from "@liveplace/domain/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTwitchAuth,
  createTwitchEventSub,
  createTwitchLiveSource,
  createTwitchWebhook,
} from "./twitch";

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

describe("createTwitchWebhook, the live of a channel (Écart §4, JOURNAL 2026-10-07)", () => {
  const secret = "eventsub-secret";
  const sentAt = Date.parse("2026-10-07T12:00:00Z");
  const webhook = createTwitchWebhook(secret);

  const messageOf = (type: string, body: string): TwitchWebhookMessage => {
    const id = "message-1";
    const timestamp = "2026-10-07T12:00:00Z";
    const hmac = createHmac("sha256", secret)
      .update(id + timestamp + body)
      .digest("hex");
    return { id, timestamp, signature: `sha256=${hmac}`, type, body };
  };

  const ONLINE =
    '{"subscription":{"type":"stream.online"},"event":{"broadcaster_user_id":"1234","type":"live",' +
    '"started_at":"2026-10-07T11:59:00Z"}}';
  const OFFLINE = '{"subscription":{"type":"stream.offline"},"event":{"broadcaster_user_id":"1234"}}';
  const CATEGORY =
    '{"subscription":{"type":"channel.update","version":"2"},"event":{"broadcaster_user_id":"1234",' +
    '"title":"Dessin","category_id":"509658","category_name":"Just Chatting"}}';
  const revocationOf = (type: string) =>
    `{"subscription":{"type":"${type}","status":"authorization_revoked","condition":{"broadcaster_user_id":"1234"}}}`;

  // Lit le début d'un live, sa fin, et le changement de catégorie, avec la chaîne qu'ils concernent
  it("reads the start of a live, its end, and a category change, with the channel they are about", () => {
    expect(webhook.read(messageOf("notification", ONLINE), sentAt)).toEqual({
      kind: "online",
      broadcasterId: "1234",
    });
    expect(webhook.read(messageOf("notification", OFFLINE), sentAt)).toEqual({
      kind: "offline",
      broadcasterId: "1234",
    });
    expect(webhook.read(messageOf("notification", CATEGORY), sentAt)).toEqual({
      kind: "category",
      broadcasterId: "1234",
      category: "Just Chatting",
    });
  });

  // Ne prend pas une rediffusion pour un live : seul `type: live` allume le statut
  it("never takes a rerun, a premiere or a watch party for a live", () => {
    for (const type of ["rerun", "premiere", "watch_party", "playlist"])
      expect(webhook.read(messageOf("notification", ONLINE.replace('"live"', `"${type}"`)), sentAt)).toEqual({
        kind: "ignored",
      });
  });

  // Une catégorie absente de l'événement donne une catégorie vide : le live reste un live
  it("gives an empty category when the event names none", () => {
    const withoutCategory = CATEGORY.replace(',"category_id":"509658","category_name":"Just Chatting"', "");

    expect(webhook.read(messageOf("notification", withoutCategory), sentAt)).toEqual({
      kind: "category",
      broadcasterId: "1234",
      category: "",
    });
  });

  // La révocation d'un abonnement de live est la sienne : elle ne passe jamais pour celle de la modération
  it("tells the revocation of a live subscription from the revocation of the moderation", () => {
    for (const type of ["stream.online", "stream.offline", "channel.update"])
      expect(webhook.read(messageOf("revocation", revocationOf(type)), sentAt)).toEqual({
        kind: "liveRevoked",
        broadcasterId: "1234",
      });
    for (const type of ["channel.ban", "channel.unban", "channel.moderator.add", "channel.moderator.remove"])
      expect(webhook.read(messageOf("revocation", revocationOf(type)), sentAt)).toEqual({
        kind: "revocation",
        broadcasterId: "1234",
      });
  });
});

describe("createTwitchEventSub, the live of a channel (Écart §4, JOURNAL 2026-10-07)", () => {
  const options = {
    clientId: "client-id",
    clientSecret: "client-secret",
    callbackUrl: "https://liveplace.tv/twitch/eventsub",
    secret: "eventsub-secret",
    isBeta: false,
  };
  const OURS = '"transport":{"callback":"https://liveplace.tv/twitch/eventsub"}';

  // Twitch, joué par URL : le jeton de l'application, puis les abonnements de la chaîne. `postStatus` : la réponse à un abonnement.
  const stubSubscriptions = (existing: string, postStatus = 202) => {
    const created: unknown[] = [];
    const cleared: string[] = [];
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      asked.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname === "/oauth2/token") return json('{"access_token":"app-token","expires_in":3600}');
      if (url.pathname === "/helix/eventsub/subscriptions" && init?.method === "POST") {
        created.push(String(init.body));
        return new Response("{}", { status: postStatus });
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

  // Abonne la chaîne au début et à la fin du live, et à la catégorie en version 2, par webhook signé
  it("subscribes the channel to the start and end of a live and to its category in version 2", async () => {
    const { created } = stubSubscriptions('{"data":[],"pagination":{}}');

    await createTwitchEventSub(options).subscribeToLive("1234");

    const transport = `{"method":"webhook","callback":"${options.callbackUrl}","secret":"${options.secret}"}`;
    expect(created).toEqual(
      [
        ["stream.online", "1"],
        ["stream.offline", "1"],
        ["channel.update", "2"],
      ].map(
        ([type, version]) =>
          `{"type":"${type}","version":"${version}","condition":{"broadcaster_user_id":"1234"},"transport":${transport}}`,
      ),
    );
  });

  // Ne prend que ce qui manque : un abonnement actif reste, un révoqué est repris, ceux de la modération ne comptent pas
  it("takes only what is missing: a live one stays, a revoked one is taken again, moderation is left alone", async () => {
    const { created, cleared } = stubSubscriptions(
      `{"data":[{"id":"on","type":"stream.online","status":"enabled",${OURS}},` +
        `{"id":"off","type":"stream.offline","status":"authorization_revoked",${OURS}},` +
        `{"id":"ban","type":"channel.ban","status":"enabled",${OURS}}],"pagination":{}}`,
    );

    await createTwitchEventSub(options).subscribeToLive("1234");

    expect(created.map((body) => JSON.parse(String(body)).type)).toEqual([
      "stream.offline",
      "channel.update",
    ]);
    expect(cleared).toEqual([]);
  });

  // Un abonnement créé entre la liste et maintenant répond 409 : il est déjà là, ce n'est pas une erreur
  it("takes a 409 as already subscribed, and fails on any other refusal", async () => {
    stubSubscriptions('{"data":[],"pagination":{}}', 409);
    await expect(createTwitchEventSub(options).subscribeToLive("1234")).resolves.toBeUndefined();

    stubSubscriptions('{"data":[],"pagination":{}}', 400);
    await expect(createTwitchEventSub(options).subscribeToLive("1234")).rejects.toThrow("stream.online");
  });

  // Une bêta ou un poste de développement ne demandent rien à Twitch, comme pour la modération (JOURNAL 2026-10-05)
  it("asks Twitch nothing from a beta slot nor from a development address", async () => {
    const { asked } = stubSubscriptions('{"data":[],"pagination":{}}');
    const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createTwitchEventSub({ ...options, isBeta: true }).subscribeToLive("1234");
    await createTwitchEventSub({
      ...options,
      callbackUrl: "http://localhost:3000/twitch/eventsub",
    }).subscribeToLive("1234");

    expect(asked).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});

describe("createTwitchLiveSource (Écart §4, JOURNAL 2026-10-07)", () => {
  const source = createTwitchLiveSource({ clientId: "client-id", clientSecret: "client-secret" });

  // Twitch, joué par URL, avec le jeton de l'application ; chaque appel garde son en-tête et son délai.
  const stubTwitch = (routes: Record<string, Response | (() => Response)>) => {
    const asked: { url: string; authorization: string | null; hasTimeout: boolean }[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      asked.push({
        url: `${url.pathname}${url.search}`,
        authorization: new Headers(init?.headers).get("Authorization"),
        hasTimeout: init?.signal instanceof AbortSignal,
      });
      if (url.pathname === "/oauth2/token") return json('{"access_token":"app-token"}');
      const route = routes[url.pathname];
      if (!route) return new Response("inconnu", { status: 404 });
      return typeof route === "function" ? route() : route;
    });
    return asked;
  };

  // Lit le live d'une chaîne dans helix/streams avec le jeton de l'application : sa catégorie, ou rien hors live
  it("reads a channel's live from helix/streams with the app token: its category, or nothing when it is not live", async () => {
    const asked = stubTwitch({
      "/helix/streams": json('{"data":[{"type":"live","game_name":"Art","user_id":"1234"}],"pagination":{}}'),
    });
    expect(await source.getLive("1234")).toEqual({ category: "Art" });
    expect(asked.map(({ url }) => url)).toContain("/helix/streams?user_id=1234");
    expect(asked.at(-1)?.authorization).toBe("Bearer app-token");

    stubTwitch({ "/helix/streams": json('{"data":[],"pagination":{}}') });
    expect(await source.getLive("1234")).toBeNull();
  });

  // Un flux qui n'est pas un live (le type vide de Twitch) n'allume rien
  it("takes a stream that is not typed live as not live", async () => {
    stubTwitch({ "/helix/streams": json('{"data":[{"type":"","game_name":"Art"}],"pagination":{}}') });

    expect(await source.getLive("1234")).toBeNull();
  });

  // Un live sans catégorie reste un live, de catégorie vide
  it("keeps a live without a category as a live", async () => {
    stubTwitch({ "/helix/streams": json('{"data":[{"type":"live","game_name":""}],"pagination":{}}') });

    expect(await source.getLive("1234")).toEqual({ category: "" });
  });

  // Lit la catégorie de la chaîne dans helix/channels, et rend une catégorie vide quand elle n'en a pas
  it("reads the category of a channel from helix/channels, empty when it has none", async () => {
    const asked = stubTwitch({
      "/helix/channels": json('{"data":[{"broadcaster_id":"1234","game_name":"Just Chatting"}]}'),
    });
    expect(await source.getCategory("1234")).toBe("Just Chatting");
    expect(asked.map(({ url }) => url)).toContain("/helix/channels?broadcaster_id=1234");

    stubTwitch({ "/helix/channels": json('{"data":[{"broadcaster_id":"1234","game_name":""}]}') });
    expect(await source.getCategory("1234")).toBe("");
    stubTwitch({ "/helix/channels": json('{"data":[]}') });
    expect(await source.getCategory("1234")).toBe("");
  });

  // Aucun appel ne peut pendre : chacun porte un délai, jeton de l'application compris
  it("gives up on a Twitch that does not answer: every call carries a timeout", async () => {
    const asked = stubTwitch({ "/helix/streams": json('{"data":[],"pagination":{}}') });
    const fresh = createTwitchLiveSource({ clientId: "client-id", clientSecret: "client-secret" });

    await fresh.getLive("1234");

    expect(asked.map(({ hasTimeout }) => hasTimeout)).toEqual([true, true]);
  });

  // Un jeton refusé est redemandé une fois ; un refus de Twitch remonte
  it("asks for a new app token once when Twitch refuses the first, and fails on any other refusal", async () => {
    let attempts = 0;
    stubTwitch({
      "/helix/streams": () => {
        attempts += 1;
        return attempts === 1 ? new Response("", { status: 401 }) : json('{"data":[],"pagination":{}}');
      },
    });
    expect(await createTwitchLiveSource({ clientId: "c", clientSecret: "s" }).getLive("1234")).toBeNull();
    expect(attempts).toBe(2);

    stubTwitch({ "/helix/streams": new Response("", { status: 500 }) });
    await expect(
      createTwitchLiveSource({ clientId: "c", clientSecret: "s" }).getLive("1234"),
    ).rejects.toThrow("helix/streams");
  });
});
