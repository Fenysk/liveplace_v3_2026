import { randomUUID } from "node:crypto";
import { type CanvasMeta, defaultCanvasMeta } from "@liveplace/domain";
import type { ModerationSource } from "@liveplace/domain/ports";
import type { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { createCanvasCore } from "./client";
import { SUPPORT_ENDS_AT_FIELD, SUPPORT_TITLE_FIELD, userKey } from "./keys";
import { createRedisHarness } from "./test-harness";

const harness = createRedisHarness();
const { redis, runId } = harness;

const OWNER = `${runId}-owner`;
const NOW = Date.UTC(2026, 10, 3, 12);
const IN_A_YEAR = Date.UTC(2027, 10, 3, 12);
const PAST = Date.UTC(2026, 10, 3, 11);

// Un noyau à l'heure fixée : l'affichage compare la fin d'un badge à CETTE heure (JOURNAL 2026-11-03).
const subscriber = redis.duplicate();
const core = createCanvasCore(redis, subscriber, () => NOW);
afterAll(() => subscriber.disconnect());

const meta: CanvasMeta = { ...defaultCanvasMeta(OWNER), width: 64, height: 64, gaugeMaxStart: 100 };
const playerOf = (name: string) => `${runId}-${name}`;

const readyCanvas = async () => {
  const canvasId = harness.uniqueCanvasId();
  await core.createCanvas(canvasId, meta);
  return canvasId;
};

const signIn = (
  name: string,
  support?: { title: "supporter" | "regular" | "pillar"; endsAt: number } | null,
) => core.setUser({ userId: playerOf(name), login: name, displayName: name.toUpperCase() }, support);

const place = async (canvasId: string, name: string, x: number) => {
  const result = await core.place(canvasId, {
    userId: playerOf(name),
    requestId: randomUUID(),
    placementId: "ptest0001",
    nowMs: NOW,
    pixels: [{ x, y: 0, colorIndex: 1 }],
  });
  if (!result.ok || result.value.accepted !== 1) throw new Error(`pose refusée pour ${name}`);
};

const nameModerator = async (canvasId: string, name: string, source: ModerationSource) => {
  const result = await core.setModerator(canvasId, { userId: playerOf(name), source, isModerator: true });
  if (!result.ok) throw new Error(result.error);
};

const ban = async (canvasId: string, name: string) => {
  const result = await core.moderate(canvasId, {
    by: OWNER,
    nowMs: NOW,
    action: { action: "ban", target: playerOf(name) },
    slice: "first",
    source: "liveplace",
  });
  if (!result.ok) throw new Error(result.error);
};

describe("le miroir écrit à la connexion (JOURNAL 2026-11-03)", () => {
  // Quand la connexion apporte un Soutien, le titre et la fin vont dans le miroir `user:<userId>`, avec le nom
  it("writes the Support title and its end next to the name", async () => {
    await signIn("lilou", { title: "regular", endsAt: IN_A_YEAR });
    expect(await redis.hgetall(userKey(playerOf("lilou")))).toEqual({
      login: "lilou",
      displayName: "LILOU",
      [SUPPORT_TITLE_FIELD]: "regular",
      [SUPPORT_ENDS_AT_FIELD]: String(IN_A_YEAR),
    });
  });

  // Une connexion sans don connu ne touche pas à un Soutien déjà écrit : il se réécrit seulement quand Convex en connaît un
  it("keeps a written Support when the next sign-in brings none", async () => {
    await signIn("keeper", { title: "pillar", endsAt: IN_A_YEAR });
    await signIn("keeper", null);
    await signIn("keeper");
    expect(await redis.hget(userKey(playerOf("keeper")), SUPPORT_TITLE_FIELD)).toBe("pillar");
  });

  // Un nouveau don relevé à la connexion remplace le titre et repousse la fin
  it("rewrites the title and the end after a new donation", async () => {
    await signIn("grower", { title: "supporter", endsAt: PAST });
    await signIn("grower", { title: "pillar", endsAt: IN_A_YEAR });
    expect(
      await redis.hmget(userKey(playerOf("grower")), SUPPORT_TITLE_FIELD, SUPPORT_ENDS_AT_FIELD),
    ).toEqual(["pillar", String(IN_A_YEAR)]);
  });
});

describe("les badges composés par le noyau (CDC des badges §2 et §3)", () => {
  // Soutien actif : le badge de son titre à l'inspection, dans le Classement et dans sa place à part
  it("sends an active Support in the inspection, the scoreboard and the place of whoever watches", async () => {
    const canvasId = await readyCanvas();
    await signIn("noxel", { title: "regular", endsAt: IN_A_YEAR });
    await place(canvasId, "noxel", 0);
    expect(await core.inspect(canvasId, 0, 0)).toMatchObject({ badges: ["support.regular"] });
    expect((await core.listScoreboard(canvasId))[0]).toMatchObject({
      login: "noxel",
      badges: ["support.regular"],
    });
    const ranks = await core.listScoreboardRanks(canvasId, [playerOf("noxel")]);
    expect(ranks.get(playerOf("noxel"))).toEqual({ rank: 1, pixels: 1, badges: ["support.regular"] });
  });

  // Soutien expiré : rien ne part, sans tâche planifiée, juste la date comparée à l'heure de l'affichage
  it("sends nothing for an expired Support", async () => {
    const canvasId = await readyCanvas();
    await signIn("late", { title: "pillar", endsAt: PAST });
    await place(canvasId, "late", 1);
    const entry = await core.inspect(canvasId, 1, 0);
    expect(entry).not.toBeNull();
    expect(entry).not.toHaveProperty("badges");
    expect((await core.listScoreboard(canvasId))[0]).not.toHaveProperty("badges");
    expect((await core.listScoreboardRanks(canvasId, [playerOf("late")])).get(playerOf("late"))).toEqual({
      rank: 1,
      pixels: 1,
    });
  });

  // Le même miroir, relu plus tard : le badge s'éteint à l'heure de l'affichage, pas à celle de l'écriture
  it("expires a Support as the clock passes its end", async () => {
    const canvasId = await readyCanvas();
    await signIn("fading", { title: "supporter", endsAt: NOW + 1000 });
    await place(canvasId, "fading", 2);
    const later = createCanvasCore(redis, subscriber, () => NOW + 1000);
    expect(await core.inspect(canvasId, 2, 0)).toMatchObject({ badges: ["support.supporter"] });
    expect(await later.inspect(canvasId, 2, 0)).not.toHaveProperty("badges");
  });

  // Modérateur : sur la fresque qu'il modère, qu'il le soit sur Twitch ou sur LivePlace, avant le Soutien
  it("gives Moderator on this canvas only, from Twitch or from LivePlace, before Support", async () => {
    const canvasId = await readyCanvas();
    const elsewhere = await readyCanvas();
    await signIn("twitchmod", { title: "supporter", endsAt: IN_A_YEAR });
    await signIn("herename");
    await nameModerator(canvasId, "twitchmod", "twitch");
    await nameModerator(canvasId, "herename", "liveplace");
    await place(canvasId, "twitchmod", 3);
    await place(canvasId, "herename", 4);
    await place(elsewhere, "twitchmod", 3);
    expect(await core.inspect(canvasId, 3, 0)).toMatchObject({ badges: ["moderator", "support.supporter"] });
    expect(await core.inspect(canvasId, 4, 0)).toMatchObject({ badges: ["moderator"] });
    // Sur une autre fresque, il ne modère pas : seul son Soutien le suit
    expect(await core.inspect(elsewhere, 3, 0)).toMatchObject({ badges: ["support.supporter"] });
  });

  // Le streamer de la fresque a tous les droits : il n'est jamais modérateur, donc n'a pas ce badge
  it("never gives Moderator to the owner of the canvas", async () => {
    const canvasId = await readyCanvas();
    await core.setUser({ userId: OWNER, login: "owner", displayName: "Owner" });
    expect(await core.setModerator(canvasId, { userId: OWNER, source: "twitch", isModerator: true })).toEqual(
      {
        ok: false,
        error: "forbidden",
      },
    );
    const result = await core.place(canvasId, {
      userId: OWNER,
      requestId: randomUUID(),
      placementId: "ptest0002",
      nowMs: NOW,
      pixels: [{ x: 5, y: 0, colorIndex: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(await core.inspect(canvasId, 5, 0)).not.toHaveProperty("badges");
  });

  // Un banni ne modère pas, même nommé modérateur sur Twitch : plus de badge Modérateur, mais son Soutien reste
  it("takes Moderator away from a banned viewer, and keeps his Support in the bans list", async () => {
    const canvasId = await readyCanvas();
    await signIn("banned", { title: "pillar", endsAt: IN_A_YEAR });
    await nameModerator(canvasId, "banned", "twitch");
    await ban(canvasId, "banned");
    const [user] = await core.listBans(canvasId);
    expect(user).toMatchObject({ login: "banned", badges: ["support.pillar"] });
  });

  // Les trois listes de la Modération : les modérateurs, les signalements, les bannis portent leurs badges
  it("sends the badges in the moderators list and in the reports", async () => {
    const canvasId = await readyCanvas();
    await signIn("modsup", { title: "regular", endsAt: IN_A_YEAR });
    await signIn("reporter");
    await nameModerator(canvasId, "modsup", "liveplace");
    await place(canvasId, "modsup", 6);
    const [moderator] = await core.listModerators(canvasId);
    expect(moderator).toMatchObject({ login: "modsup", badges: ["moderator", "support.regular"] });
    const reported = await core.report(canvasId, {
      reporterId: playerOf("reporter"),
      x: 6,
      y: 0,
      placementId: "ptest0001",
      threshold: 5,
      nowMs: NOW,
    });
    expect(reported.ok).toBe(true);
    const [report] = await core.listReports(canvasId);
    expect(report).toMatchObject({ login: "modsup", badges: ["moderator", "support.regular"] });
  });

  // Sans compte ni Soutien ni rôle : aucune clé `badges`, la frame reste ce qu'elle était
  it("sends no badges key to a viewer with none", async () => {
    const canvasId = await readyCanvas();
    await signIn("plain");
    await place(canvasId, "plain", 7);
    expect(await core.inspect(canvasId, 7, 0)).not.toHaveProperty("badges");
  });

  // Un miroir abîmé (titre inconnu, date illisible) ne donne aucun badge et ne casse pas l'affichage
  it("ignores a damaged mirror", async () => {
    const canvasId = await readyCanvas();
    await signIn("damaged");
    await redis.hset(userKey(playerOf("damaged")), {
      [SUPPORT_TITLE_FIELD]: "legend",
      [SUPPORT_ENDS_AT_FIELD]: "demain",
    });
    await place(canvasId, "damaged", 8);
    expect(await core.inspect(canvasId, 8, 0)).not.toHaveProperty("badges");
  });
});

type Chain = Record<string, (...args: unknown[]) => unknown>;
const NOT_COMMANDS = new Set(["pipeline", "multi", "duplicate", "defineCommand", "on", "once", "off"]);

// Un client Redis qui compte ses allers-retours : une commande seule en vaut un, un MULTI ou un pipeline en vaut un à son `exec`.
const countTrips = (client: Redis) => {
  let trips = 0;
  const wrapChain = (chain: Chain): Chain => {
    const proxy: Chain = new Proxy(chain, {
      get: (target, name: string) => {
        const member = target[name];
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
          if (name === "exec") trips++;
          const result = member.apply(target, args);
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  };
  const counted = new Proxy(client, {
    get: (target, name: string) => {
      const member: unknown = Reflect.get(target, name);
      if (typeof member !== "function") return member;
      if (name === "pipeline" || name === "multi") return () => wrapChain(member.call(target));
      return (...args: unknown[]) => {
        if (!NOT_COMMANDS.has(name)) trips++;
        return member.apply(target, args);
      };
    },
  });
  const reset = () => {
    trips = 0;
  };
  return { client: counted, trips: () => trips, reset };
};

describe("la place de chaque viewer en un seul aller-retour (JOURNAL 2026-11-03)", () => {
  // Les rangs et les badges de tous les viewers se lisent dans le même pipeline : le coût ne grandit pas avec l'audience
  it("reads the ranks and the badges of every viewer in one round trip, however many there are", async () => {
    const canvasId = await readyCanvas();
    const names = ["ra", "rb", "rc", "rd", "re", "rf"];
    for (const [index, name] of names.entries()) {
      await signIn(name, name === "ra" ? { title: "regular", endsAt: IN_A_YEAR } : null);
      await place(canvasId, name, index);
    }
    await nameModerator(canvasId, "rb", "liveplace");
    await ban(canvasId, "rf");
    const counter = countTrips(redis);
    const counted = createCanvasCore(counter.client, subscriber, () => NOW);
    counter.reset();

    const ranks = await counted.listScoreboardRanks(canvasId, names.map(playerOf));
    expect(counter.trips()).toBe(1);
    expect(ranks.get(playerOf("ra"))).toMatchObject({ badges: ["support.regular"] });
    expect(ranks.get(playerOf("rb"))).toMatchObject({ badges: ["moderator"] });
    expect(ranks.get(playerOf("rc"))).not.toHaveProperty("badges");
    expect(ranks.has(playerOf("rf"))).toBe(false); // un banni n'a plus de place au classement

    counter.reset();
    await counted.listScoreboardRanks(canvasId, [playerOf("ra")]);
    expect(counter.trips()).toBe(1);
  });

  // Personne à lire : aucun appel à Redis
  it("does not call Redis when nobody is asked for", async () => {
    const counter = countTrips(redis);
    const counted = createCanvasCore(counter.client, subscriber, () => NOW);
    counter.reset();
    expect((await counted.listScoreboardRanks(await readyCanvas(), [])).size).toBe(0);
    expect(counter.trips()).toBe(0);
  });
});
