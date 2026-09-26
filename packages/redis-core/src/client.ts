// Client typé du noyau Redis (§5.6).

import { readFileSync } from "node:fs";
import {
  type CanvasMeta,
  CELL_STRIDE,
  PALETTE,
  refillGauge,
  type Timestamp,
  toCell,
  toCellKey,
  toStateOffset,
} from "@liveplace/domain";
import type {
  AckFrame,
  BannedUser,
  CanvasCore,
  InspectEntry,
  LiveMessage,
  Moderation,
  ModerationSlice,
  Moderator,
  Pixel,
  Placement,
  SignInWrites,
  Snapshot,
  TwitchCommand,
  TwitchCommandQueue,
  TwitchWrites,
  Unsubscribe,
} from "@liveplace/domain/ports";
import { decodeServerFrame, type Event } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { Redis, Result as RedisResult } from "ioredis";
import {
  buildCanvasKeys,
  CLEAR_SLICE_CELLS,
  EVENTS_MAXLEN,
  GAUGE_TTL_SECONDS,
  HIST_DEPTH,
  RECENT_MAX_EVENTS,
  REQ_TTL_SECONDS,
  TWITCH_COMMANDS_CONSUMER,
  TWITCH_COMMANDS_KEY,
  TWITCH_COMMANDS_MAXLEN,
  TWITCH_COMMANDS_READER,
  userKey,
} from "./keys";

declare module "ioredis" {
  interface RedisCommander<Context> {
    place(...args: (string | number)[]): RedisResult<[status: string, ack?: string], Context>;
    moderate(
      ...args: (string | number)[]
    ): RedisResult<[status: string, version?: number, cells?: number, isDone?: number], Context>;
    moderators(...args: (string | number)[]): RedisResult<string, Context>;
  }
}

const metaText = (fields: Record<string, string>, field: string): string => {
  const value = fields[field];
  if (value === undefined) throw new Error(`meta.${field} absent`);
  return value;
};

const metaNumber = (fields: Record<string, string>, field: string): number => {
  const value = Number(metaText(fields, field));
  if (!Number.isFinite(value)) throw new Error(`meta.${field} n'est pas un nombre`);
  return value;
};

// Une entrée du stream : ses champs à plat, dont `e`, l'événement écrit par nos scripts Lua (§5.2).
const eventOf = (fields: string[]): Event => {
  const raw = fields[fields.indexOf("e") + 1];
  if (raw === undefined) throw new Error("entrée du stream sans événement");
  return JSON.parse(raw);
};

// Le nom Twitch gardé pour qui n'a pas de compte (JOURNAL 2026-09-27) : écrit par setTwitchUsers, lu ici seulement.
const twitchNameOf = (raw: string | null): { login?: string; displayName?: string } =>
  raw === null ? {} : JSON.parse(raw);

// Une commande d'un MULTI : ioredis rend `[erreur, valeur]` par commande.
const unwrap = (entry: [Error | null, unknown] | undefined): unknown => {
  if (!entry) throw new Error("réponse MULTI incomplète");
  const [error, value] = entry;
  if (error) throw error;
  return value;
};

// Ce que le web écrit à la connexion (§2) : ni script ni connexion abonnée, il ne pose jamais un pixel.
export function createSignInWrites(redis: Redis): SignInWrites {
  return {
    // `NX` partout : idempotent, et `ready` n'est jamais remis à 1 sur un canvas en cours de restore.
    async createCanvas(canvasId: string, meta: CanvasMeta): Promise<void> {
      const keys = buildCanvasKeys(canvasId);
      const transaction = redis.multi();
      for (const [field, value] of Object.entries(meta)) transaction.hsetnx(keys.meta, field, value);
      await transaction
        .set(keys.state, Buffer.alloc(meta.width * meta.height), "NX")
        .set(keys.version, 0, "NX")
        .hsetnx(keys.meta, "ready", 1)
        .exec();
    },

    async setUser({ userId, login, displayName, avatarUrl }): Promise<void> {
      await redis.hset(userKey(userId), { login, displayName, ...(avatarUrl ? { avatarUrl } : {}) });
    },
  };
}

// Écart §2 (JOURNAL 2026-09-27) : des noms et des actions à appliquer, jamais un pixel ni un script.
export function createTwitchWrites(redis: Redis): TwitchWrites {
  return {
    async setTwitchUsers(canvasId, users) {
      if (users.length === 0) return;
      const entries = users.map(({ userId, login, displayName }) => [
        userId,
        JSON.stringify({ login, displayName }),
      ]);
      await redis.hset(buildCanvasKeys(canvasId).twitchUsers, Object.fromEntries(entries));
    },

    async queueTwitchCommands(commands) {
      if (commands.length === 0) return;
      const transaction = redis.multi();
      for (const command of commands)
        transaction.xadd(
          TWITCH_COMMANDS_KEY,
          "MAXLEN",
          "~",
          TWITCH_COMMANDS_MAXLEN,
          "*",
          "c",
          JSON.stringify(command),
        );
      await transaction.exec();
    },
  };
}

// La réponse d'un XREADGROUP sur un seul stream : ses entrées, `[id, [champ, valeur, …]]`.
const streamEntriesOf = (reply: unknown): { id: string; command: TwitchCommand }[] => {
  const entries: unknown = Array.isArray(reply) && Array.isArray(reply[0]) ? reply[0][1] : [];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: unknown) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) return [];
    const fields: unknown[] = entry[1];
    const raw = fields[fields.indexOf("c") + 1];
    if (typeof raw !== "string") return [];
    // Déposé par createTwitchWrites ; la forme est couverte par les tests.
    const command: TwitchCommand = JSON.parse(raw);
    return [{ id: entry[0], command }];
  });
};

const TWITCH_COMMANDS_READ_COUNT = 50;

// Sur sa propre connexion : un XREADGROUP qui attend bloque toute autre commande.
export function createTwitchCommandQueue(redis: Redis): TwitchCommandQueue {
  let hasReader = false;
  let isRecovered = false; // ce qu'un arrêt a laissé lu mais pas acquitté passe avant les nouvelles actions

  // Ce qui a été lu par ce consommateur sans être acquitté : rendu tout de suite, sans attendre.
  const listUnacknowledged = () =>
    redis.xreadgroup(
      "GROUP",
      TWITCH_COMMANDS_READER,
      TWITCH_COMMANDS_CONSUMER,
      "COUNT",
      TWITCH_COMMANDS_READ_COUNT,
      "STREAMS",
      TWITCH_COMMANDS_KEY,
      "0",
    );

  // Ce qu'aucun consommateur n'a encore lu : attend au plus `blockMs`.
  const listUnread = (blockMs: number) =>
    redis.xreadgroup(
      "GROUP",
      TWITCH_COMMANDS_READER,
      TWITCH_COMMANDS_CONSUMER,
      "COUNT",
      TWITCH_COMMANDS_READ_COUNT,
      "BLOCK",
      blockMs,
      "STREAMS",
      TWITCH_COMMANDS_KEY,
      ">",
    );

  const ensureReader = async (): Promise<void> => {
    if (hasReader) return;
    try {
      await redis.xgroup("CREATE", TWITCH_COMMANDS_KEY, TWITCH_COMMANDS_READER, "0", "MKSTREAM");
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("BUSYGROUP"))) throw error;
    }
    hasReader = true;
  };

  return {
    async listTwitchCommands(blockMs) {
      await ensureReader();
      if (!isRecovered) {
        const pending = streamEntriesOf(await listUnacknowledged());
        if (pending.length > 0) return pending;
        isRecovered = true;
      }
      return streamEntriesOf(await listUnread(blockMs));
    },

    async ackTwitchCommand(id) {
      await redis.xack(TWITCH_COMMANDS_KEY, TWITCH_COMMANDS_READER, id);
    },
  };
}

export function createCanvasCore(redis: Redis, liveSubscriber: Redis): CanvasCore {
  redis.defineCommand("place", {
    numberOfKeys: 7,
    lua: readFileSync(new URL("./place.lua", import.meta.url), "utf8"),
  });
  redis.defineCommand("moderate", {
    numberOfKeys: 11,
    lua: readFileSync(new URL("./moderate.lua", import.meta.url), "utf8"),
  });
  redis.defineCommand("moderators", {
    numberOfKeys: 4,
    lua: readFileSync(new URL("./moderators.lua", import.meta.url), "utf8"),
  });

  // Un seul rappel par canal, sur la seule connexion abonnée du process (§6.3).
  const listeners = new Map<string, (message: LiveMessage) => void>();
  liveSubscriber.on("message", (channel: string, raw: string) => {
    // Publié par nos scripts Lua ; la forme est couverte par les tests.
    const message: LiveMessage = JSON.parse(raw);
    listeners.get(channel)?.(message);
  });

  const isBanned = async (canvasId: string, userId: string): Promise<boolean> =>
    (await redis.sismember(buildCanvasKeys(canvasId).bans, userId)) === 1;

  return {
    ...createSignInWrites(redis),

    // `null` tant que `ready` n'est pas à 1 : on ne sert jamais un canvas en cours de restore (§5.5).
    async getCanvas(canvasId: string): Promise<CanvasMeta | null> {
      const fields = await redis.hgetall(buildCanvasKeys(canvasId).meta);
      if (fields.ready !== "1") return null;
      return {
        ownerId: metaText(fields, "ownerId"),
        width: metaNumber(fields, "width"),
        height: metaNumber(fields, "height"),
        gaugeMax: metaNumber(fields, "gaugeMax"),
        refillMs: metaNumber(fields, "refillMs"),
        refillCharges: metaNumber(fields, "refillCharges"),
        obsDelayMs: metaNumber(fields, "obsDelayMs"),
      };
    },

    async isModerator(canvasId: string, userId: string): Promise<boolean> {
      return (await redis.sismember(buildCanvasKeys(canvasId).mods, userId)) === 1;
    },

    // Un seul MULTI : entre deux commandes, une pose donnerait un état d'avant et une version d'après (§6.1).
    async getSnapshot(canvasId: string): Promise<Snapshot> {
      const keys = buildCanvasKeys(canvasId);
      const results = await redis.multi().getBuffer(keys.state).get(keys.version).exec();
      if (!results) throw new Error(`getSnapshot ${canvasId} : transaction annulée`);
      const state = unwrap(results[0]);
      const version = unwrap(results[1]);
      if (!Buffer.isBuffer(state) || typeof version !== "string")
        throw new Error(`getSnapshot ${canvasId} : état ou version illisible`);
      return { state, version: Number(version) };
    },

    // La formule de place.lua, sans jamais écrire : seul le script modifie une jauge.
    async getGauge(canvasId: string, userId: string, nowMs: Timestamp): Promise<AckFrame["gauge"]> {
      const keys = buildCanvasKeys(canvasId);
      const [fields, [charges, at]] = await Promise.all([
        redis.hgetall(keys.meta),
        redis.hmget(keys.gauge(userId), "charges", "at"),
      ]);
      const params = {
        gaugeMax: metaNumber(fields, "gaugeMax"),
        refillMs: metaNumber(fields, "refillMs"),
        refillCharges: metaNumber(fields, "refillCharges"),
      };
      const stored = charges && at ? { charges: Number(charges), at: Number(at) } : undefined;
      const gauge = refillGauge(stored, nowMs, params);
      return { charges: gauge.charges, max: params.gaugeMax, nextRefillAt: gauge.at + params.refillMs };
    },

    // L'ordre des arguments est celui que lit place.lua.
    async place(canvasId: string, placement: Placement): Promise<Result<AckFrame, "canvas_not_found">> {
      const { userId, requestId, nowMs, pixels } = placement;
      const keys = buildCanvasKeys(canvasId);
      const [status, ack] = await redis.place(
        keys.meta,
        keys.state,
        keys.version,
        keys.events,
        keys.bans,
        keys.gauge(userId),
        keys.req(userId, requestId),
        keys.histPrefix,
        keys.cellsPrefix,
        keys.live,
        userId,
        requestId,
        nowMs,
        PALETTE.length, // Écart §5.3 (JOURNAL 2026-09-15) : pas dans `meta`
        CELL_STRIDE,
        HIST_DEPTH,
        EVENTS_MAXLEN,
        GAUGE_TTL_SECONDS,
        REQ_TTL_SECONDS,
        ...pixels.flatMap(({ x, y, colorIndex }) => [x, y, colorIndex]),
      );
      if (status === "canvas_not_found") return { ok: false, error: "canvas_not_found" };
      const frame = decodeServerFrame(JSON.parse(ack ?? "null"));
      if (frame.ok && frame.value.t === "ack") return { ok: true, value: frame.value };
      throw new Error(`place.lua a renvoyé un ack invalide : ${ack}`);
    },

    // La tête de `hist:` est le pixel visible (§5.1). L'entrée se lit par la fin, comme dans place.lua.
    async inspect(canvasId: string, x: number, y: number): Promise<InspectEntry | null> {
      const head = await redis.lindex(buildCanvasKeys(canvasId).hist(toCellKey(x, y)), 0);
      if (head === null) return null;
      const [, userId, colorIndex, placedAt] = /^(.*):(\d+):(\d+):\d+$/.exec(head) ?? [];
      if (userId === undefined || colorIndex === undefined || placedAt === undefined)
        throw new Error(`inspect ${canvasId} : entrée d'historique illisible (${head})`);
      // Sans miroir, l'auteur garde au moins son identifiant : le miroir n'expire jamais, c'est un filet.
      const user = await redis.hgetall(userKey(userId));
      return {
        userId,
        login: user.login ?? userId,
        displayName: user.displayName ?? userId,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        colorIndex: Number(colorIndex),
        placedAt: Number(placedAt),
      };
    },

    // L'ordre des arguments est celui que lit moderate.lua.
    async moderate(
      canvasId: string,
      { by, nowMs, action: { action, target }, slice, source = "liveplace" }: Moderation,
    ): Promise<Result<ModerationSlice, "canvas_not_found" | "forbidden">> {
      const keys = buildCanvasKeys(canvasId);
      const [status, version, cells, isDone] = await redis.moderate(
        keys.meta,
        keys.state,
        keys.version,
        keys.events,
        keys.bans,
        keys.mods,
        keys.cleared,
        keys.clearing(target),
        keys.cells(target),
        keys.ban(target),
        keys.bansTwitch,
        keys.histPrefix,
        keys.cellsPrefix,
        keys.live,
        by,
        action,
        target,
        slice,
        nowMs,
        CELL_STRIDE,
        CLEAR_SLICE_CELLS,
        EVENTS_MAXLEN,
        source,
      );
      if (status === "canvas_not_found" || status === "forbidden") return { ok: false, error: status };
      if (status !== "moderated" || version === undefined || cells === undefined)
        throw new Error(`moderate.lua a renvoyé une réponse invalide : ${status}`);
      return { ok: true, value: { version, cells, isDone: isDone === 1 } };
    },

    isBanned,

    // Un banni : sa preuve, figée au ban (§5.1). Sinon : les cases dont il est l'auteur visible, retrait interrompu compris.
    async listPixels(canvasId: string, userId: string): Promise<Pixel[]> {
      const keys = buildCanvasKeys(canvasId);
      if (await isBanned(canvasId, userId)) {
        const proof = await redis.hgetall(keys.ban(userId));
        return Object.entries(proof).map(([cellKey, colorIndex]) => ({
          ...toCell(Number(cellKey)),
          colorIndex: Number(colorIndex),
        }));
      }
      const results = await redis
        .multi()
        .sunion(keys.cells(userId), keys.clearing(userId))
        .getBuffer(keys.state)
        .hget(keys.meta, "width")
        .exec();
      if (!results) throw new Error(`listPixels ${canvasId} : transaction annulée`);
      const [cellKeys, state, width] = results.map(unwrap);
      if (!Array.isArray(cellKeys) || !Buffer.isBuffer(state) || typeof width !== "string")
        throw new Error(`listPixels ${canvasId} : cases, état ou largeur illisibles`);
      return cellKeys.map((cellKey) => {
        const cell = toCell(Number(cellKey));
        return { ...cell, colorIndex: state[toStateOffset(cell.x, cell.y, Number(width))] ?? 0 };
      });
    },

    // Triés par nom d'affichage. Sans miroir, le nom Twitch, sinon l'identifiant, comme pour `inspect`.
    async listBans(canvasId: string): Promise<BannedUser[]> {
      const keys = buildCanvasKeys(canvasId);
      const userIds = await redis.smembers(keys.bans);
      const users = await Promise.all(
        userIds.map(async (userId): Promise<BannedUser> => {
          const [user, twitchUser, pixelCount, isFromTwitch] = await Promise.all([
            redis.hgetall(userKey(userId)),
            redis.hget(keys.twitchUsers, userId),
            redis.hlen(keys.ban(userId)),
            redis.sismember(keys.bansTwitch, userId),
          ]);
          const hasAccount = user.login !== undefined;
          const named = hasAccount ? user : twitchNameOf(twitchUser);
          return {
            userId,
            login: named.login ?? userId,
            displayName: named.displayName ?? userId,
            ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            pixelCount,
            isFromTwitch: isFromTwitch === 1,
            hasAccount,
          };
        }),
      );
      return users.sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    // L'ordre des arguments est celui que lit moderators.lua.
    async setModerator(canvasId, { userId, source, isModerator }) {
      const keys = buildCanvasKeys(canvasId);
      const status = await redis.moderators(
        keys.meta,
        keys.mods,
        keys.modsTwitch,
        keys.modsLiveplace,
        keys.live,
        userId,
        source,
        isModerator ? 1 : 0,
      );
      if (status === "canvas_not_found" || status === "forbidden") return { ok: false, error: status };
      if (status !== "ok") throw new Error(`moderators.lua a renvoyé une réponse invalide : ${status}`);
      return { ok: true, value: undefined };
    },

    // Triés par nom d'affichage : le miroir d'un compte, sinon le nom venu de Twitch, sinon l'identifiant.
    async listModerators(canvasId: string): Promise<Moderator[]> {
      const keys = buildCanvasKeys(canvasId);
      const userIds = await redis.smembers(keys.mods);
      const moderators = await Promise.all(
        userIds.map(async (userId): Promise<Moderator> => {
          const [user, twitchUser, isFromTwitch, isNamedHere] = await Promise.all([
            redis.hgetall(userKey(userId)),
            redis.hget(keys.twitchUsers, userId),
            redis.sismember(keys.modsTwitch, userId),
            redis.sismember(keys.modsLiveplace, userId),
          ]);
          const hasAccount = user.login !== undefined;
          const named = hasAccount ? user : twitchNameOf(twitchUser);
          return {
            userId,
            login: named.login ?? userId,
            displayName: named.displayName ?? userId,
            ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            isFromTwitch: isFromTwitch === 1,
            isNamedHere: isNamedHere === 1,
            hasAccount,
          };
        }),
      );
      return moderators.sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    // L'ID du stream est la version (§5.2) : un XRANGE direct. Toute version a son entrée, donc un trou veut dire un trim.
    async listEvents(canvasId: string, fromVersion: number, maxCount: number): Promise<Event[] | null> {
      const keys = buildCanvasKeys(canvasId);
      const results = await redis
        .multi()
        .xrange(keys.events, `${fromVersion}-0`, "+", "COUNT", maxCount + 1)
        .get(keys.version)
        .exec();
      if (!results) throw new Error(`listEvents ${canvasId} : transaction annulée`);
      const [entries, version] = results.map(unwrap);
      if (!Array.isArray(entries) || typeof version !== "string")
        throw new Error(`listEvents ${canvasId} : stream ou version illisible`);
      const lastVersion = Number(version);
      // Un client en avance sur le canvas (un Redis revenu en arrière) repart d'un snapshot.
      if (fromVersion > lastVersion + 1 || entries.length > maxCount) return null;
      const events = entries.map(([, fields]: [string, string[]]) => eventOf(fields));
      const isComplete =
        events.length === lastVersion - fromVersion + 1 &&
        (events[0]?.version ?? fromVersion) === fromVersion;
      return isComplete ? events : null;
    },

    // Seul accès par le temps (§5.6) : à l'envers depuis la fin, jusqu'au premier événement trop ancien.
    async listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]> {
      const entries = await redis.xrevrange(
        buildCanvasKeys(canvasId).events,
        "+",
        "-",
        "COUNT",
        RECENT_MAX_EVENTS,
      );
      const recent: Event[] = [];
      for (const [, fields] of entries) {
        const event = eventOf(fields);
        if (event.occurredAt < sinceMs) break;
        recent.push(event);
      }
      return recent.reverse();
    },

    // Écart CDC v3 §1 (JOURNAL 2026-09-25) : un réglage, pas un pixel. Ni version, ni entrée dans le stream.
    async setObsDelay(canvasId: string, obsDelayMs: number): Promise<void> {
      const keys = buildCanvasKeys(canvasId);
      const control: LiveMessage = { ctl: { t: "obsDelay", obsDelayMs } };
      await redis
        .multi()
        .hset(keys.meta, "obsDelayMs", obsDelayMs)
        .publish(keys.live, JSON.stringify(control))
        .exec();
    },

    // Le comptage des abonnés appartient au gateway : premier client → abonnement, dernier → départ (§6.3).
    async subscribe(canvasId: string, onMessage: (message: LiveMessage) => void): Promise<Unsubscribe> {
      const channel = buildCanvasKeys(canvasId).live;
      listeners.set(channel, onMessage);
      await liveSubscriber.subscribe(channel);
      return async () => {
        if (listeners.get(channel) !== onMessage) return; // un abonnement plus récent a repris le canal
        listeners.delete(channel);
        await liveSubscriber.unsubscribe(channel);
      };
    },
  };
}
