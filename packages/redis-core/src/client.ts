// Client typé du noyau Redis (§5.6).

import { readFileSync } from "node:fs";
import {
  type CanvasMeta,
  CELL_STRIDE,
  COUNTED_PIXELS_PER_DAY,
  claimableRewards,
  GAUGE_GROWTH_FACTOR,
  type GaugeLimits,
  OBS_BACKGROUND,
  OBS_BACKGROUNDS,
  PALETTE,
  playerGaugeMax,
  refillGauge,
  SCOREBOARD_SIZE,
  type Timestamp,
  TRANSPARENT_COLOR_INDEX,
  toCell,
  toCellKey,
  toParisDay,
} from "@liveplace/domain";
import type {
  AckFrame,
  AuthoredPixel,
  BannedUser,
  CanvasCore,
  CanvasRefusal,
  InspectEntry,
  LiveMessage,
  Moderation,
  ModerationSlice,
  Moderator,
  ModeratorOrigin,
  OffStreamCell,
  Placement,
  ReportedPlacement,
  ScoreboardEntry,
  ScoreboardRank,
  SignInWrites,
  Snapshot,
  TwitchCommand,
  TwitchCommandQueue,
  TwitchSync,
  TwitchWrites,
  Unsubscribe,
} from "@liveplace/domain/ports";
import { decodeServerFrame, type Event } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { Redis, Result as RedisResult } from "ioredis";
import { createSignupWrites } from "./activity";
import {
  buildCanvasKeys,
  CLEAR_SLICE_CELLS,
  EVENTS_MAXLEN,
  GAUGE_TTL_SECONDS,
  HIST_DEPTH,
  RECENT_MAX_EVENTS,
  RECENTLY_CLEARED_TTL_SECONDS,
  REQ_TTL_SECONDS,
  SCORE_MAX_PIXELS,
  SCORE_TIE_SPAN,
  TWITCH_COMMANDS_CONSUMER,
  TWITCH_COMMANDS_KEY,
  TWITCH_COMMANDS_MAXLEN,
  TWITCH_COMMANDS_READER,
  toPlacementKey,
  toPlacementRef,
  toScorePixels,
  userKey,
} from "./keys";
import { getTwitchLiveState, listTwitchLives } from "./twitch-live";

declare module "ioredis" {
  interface RedisCommander<Context> {
    place(...args: (string | number)[]): RedisResult<[status: string, ack?: string], Context>;
    claim(...args: (string | number)[]): RedisResult<[status: string, ack?: string], Context>;
    moderate(
      ...args: (string | number)[]
    ): RedisResult<[status: string, version?: number, cells?: number, isDone?: number], Context>;
    moderators(...args: (string | number)[]): RedisResult<string, Context>;
    report(...args: (string | number)[]): RedisResult<string, Context>;
    streamView(...args: (string | number)[]): RedisResult<number[], Context>;
    resize(...args: (string | number)[]): RedisResult<[status: string, version?: number], Context>;
  }
}

type CanvasKeys = ReturnType<typeof buildCanvasKeys>;

// §5.1 : une entrée de pile, lue par la fin comme dans pile.lua.
// Un pixel d'avant le protocole 6 a pour pose sa version.
const PILE_ENTRY = /^(.*):(\d+):(\d+):(\d+)(?::([A-Za-z][A-Za-z0-9]*))?$/;

type PileEntry = { authorId: string; colorIndex: number; placedAt: Timestamp; placementId: string };

const parseEntry = (entry: string): PileEntry => {
  const [, authorId, colorIndex, placedAt, version, placementId] = PILE_ENTRY.exec(entry) ?? [];
  if (authorId === undefined || colorIndex === undefined || placedAt === undefined || version === undefined)
    throw new Error(`entrée d'historique illisible (${entry})`);
  return {
    authorId,
    colorIndex: Number(colorIndex),
    placedAt: Number(placedAt),
    placementId: placementId ?? version,
  };
};

// Un pixel visible d'un auteur : son heure et sa pose sont connues.
type VisiblePixel = Required<AuthoredPixel>;

// §5.4 : la pose visée et sa plage, vides pour les autres actions (moderate.lua).
const placementArgsOf = (action: Moderation["action"]): [string, number | "", number | ""] => {
  if (action.action === "approvePlacement") return [action.placementId, "", ""];
  if (action.action !== "clearPlacement") return ["", "", ""];
  return [action.placementId, action.range?.from ?? "", action.range?.to ?? ""];
};

// Un script qui ne sert pas le canvas le dit par son statut : absent, pas prêt (§5.5), ou archivé (Écart §15, JOURNAL 2026-10-06).
const isRefusal = (status: string): status is CanvasRefusal =>
  status === "canvas_not_found" || status === "canvas_archived";

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

// `null` tant que `ready` n'est pas à 1 : on ne sert jamais un canvas en cours de restore (§5.5).
// Écart §15 (JOURNAL 2026-10-06) : une archive reste prête et se sert ; `archivedAt` la dit, `successorId` où suivre.
export async function getCanvasMeta(redis: Redis, canvasId: string): Promise<CanvasMeta | null> {
  const fields = await redis.hgetall(buildCanvasKeys(canvasId).meta);
  if (fields.ready !== "1") return null;
  return {
    ownerId: metaText(fields, "ownerId"),
    width: metaNumber(fields, "width"),
    height: metaNumber(fields, "height"),
    gaugeMaxStart: metaNumber(fields, "gaugeMaxStart"),
    gaugeMaxCeiling: metaNumber(fields, "gaugeMaxCeiling"),
    refillMs: metaNumber(fields, "refillMs"),
    refillCharges: metaNumber(fields, "refillCharges"),
    obsDelayMs: metaNumber(fields, "obsDelayMs"),
    // CDC 2026 §1 : absent sur un canvas d'avant, ou d'une valeur inconnue, donc transparent.
    obsBackground:
      OBS_BACKGROUNDS.find((background) => background === fields.obsBackground) ?? OBS_BACKGROUND,
    ...(fields.archivedAt === undefined ? {} : { archivedAt: metaNumber(fields, "archivedAt") }),
    ...(fields.successorId === undefined ? {} : { successorId: metaText(fields, "successorId") }),
    // Écart §8.1 (JOURNAL 2026-10-07) : un champ vide vaut pas de thème.
    ...(fields.theme ? { theme: fields.theme } : {}),
  };
}

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
    ...createSignupWrites(redis), // écart §5.1 (JOURNAL 2026-10-06) : un nouveau compte, à sa première connexion
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

// §2 : des noms et des actions à appliquer, jamais un pixel ni un script.
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

    async setTwitchSync(canvasId, { status, syncedAt }) {
      await redis.hset(buildCanvasKeys(canvasId).meta, { twitchSync: status, twitchSyncedAt: syncedAt });
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

const scriptOf = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

export function createCanvasCore(redis: Redis, liveSubscriber: Redis): CanvasCore {
  // §5.4 : pile.lua, collé devant chaque script qui lit une pile.
  const pile = scriptOf("pile.lua");
  const withPile = (name: string): string => `${pile}\n${scriptOf(name)}`;
  // §5.3 : gauge.lua, collé devant les deux scripts qui écrivent une jauge.
  const gauge = scriptOf("gauge.lua");
  redis.defineCommand("place", { numberOfKeys: 13, lua: `${gauge}\n${withPile("place.lua")}` });
  redis.defineCommand("claim", { numberOfKeys: 5, lua: `${gauge}\n${scriptOf("claim.lua")}` });
  redis.defineCommand("moderate", { numberOfKeys: 19, lua: withPile("moderate.lua") });
  redis.defineCommand("moderators", { numberOfKeys: 4, lua: scriptOf("moderators.lua") });
  redis.defineCommand("report", { numberOfKeys: 10, lua: withPile("report.lua") });
  redis.defineCommand("streamView", { numberOfKeys: 5, lua: withPile("stream-view.lua") });
  redis.defineCommand("resize", { numberOfKeys: 3, lua: withPile("resize.lua") });

  // Un seul rappel par canal, sur la seule connexion abonnée du process (§6.3).
  const listeners = new Map<string, (message: LiveMessage) => void>();
  liveSubscriber.on("message", (channel: string, raw: string) => {
    // Publié par nos scripts Lua ; la forme est couverte par les tests.
    const message: LiveMessage = JSON.parse(raw);
    listeners.get(channel)?.(message);
  });

  const isBanned = async (canvasId: string, userId: string): Promise<boolean> =>
    (await redis.sismember(buildCanvasKeys(canvasId).bans, userId)) === 1;

  // Le nom d'une personne : le miroir de son compte, sinon le nom venu de Twitch, sinon l'identifiant, comme `inspect`.
  const getProfile = async (keys: CanvasKeys, userId: string) => {
    const [user, twitchUser] = await Promise.all([
      redis.hgetall(userKey(userId)),
      redis.hget(keys.twitchUsers, userId),
    ]);
    const hasAccount = user.login !== undefined;
    const named = hasAccount ? user : twitchNameOf(twitchUser);
    return {
      userId,
      login: named.login ?? userId,
      displayName: named.displayName ?? userId,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      hasAccount,
    };
  };

  // Les cases dont il est l'auteur visible, retrait interrompu compris, lues à la tête de leur pile. §5.7 : dans le
  // cadre seulement.
  const listVisiblePixels = async (keys: CanvasKeys, userId: string): Promise<VisiblePixel[]> => {
    const [cellKeys, [width, height]] = await Promise.all([
      redis.sunion(keys.cells(userId), keys.clearing(userId)),
      redis.hmget(keys.meta, "width", "height"),
    ]);
    const cells = cellKeys
      .map((cellKey) => toCell(Number(cellKey)))
      .filter(({ x, y }) => x < Number(width) && y < Number(height));
    const pipeline = redis.pipeline();
    for (const { x, y } of cells) pipeline.lindex(keys.hist(toCellKey(x, y)), 0);
    const heads = cells.length > 0 ? ((await pipeline.exec()) ?? []) : [];
    return cells.flatMap((cell, index) => {
      const head = unwrap(heads[index]);
      if (typeof head !== "string") return [];
      const { authorId, colorIndex, placedAt, placementId } = parseEntry(head);
      return authorId === userId ? [{ ...cell, colorIndex, placedAt, placementId }] : [];
    });
  };

  // Les signalements d'une pose disparue partent, et les modérateurs l'apprennent (JOURNAL 2026-09-28).
  const settleReports = async (keys: CanvasKeys, placementKeys: string[]): Promise<void> => {
    if (placementKeys.length === 0) return;
    const transaction = redis.multi().zrem(keys.reported, ...placementKeys);
    for (const placementKey of placementKeys) transaction.del(keys.reports(placementKey));
    await transaction.exec();
    const control: LiveMessage = { ctl: { t: "reports", count: await redis.zcard(keys.reported) } };
    await redis.publish(keys.live, JSON.stringify(control));
  };

  const { createCanvas, setUser } = createSignInWrites(redis);
  return {
    createCanvas,
    setUser,

    getCanvas: (canvasId: string): Promise<CanvasMeta | null> => getCanvasMeta(redis, canvasId),

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

    // La formule de gauge.lua, sans jamais écrire : seuls les scripts modifient une jauge.
    async getGauge(canvasId: string, userId: string, nowMs: Timestamp): Promise<AckFrame["gauge"]> {
      const keys = buildCanvasKeys(canvasId);
      const [fields, [charges, at], [counted, claimed], isBannedUser] = await Promise.all([
        redis.hgetall(keys.meta),
        redis.hmget(keys.gauge(userId), "charges", "at"),
        redis.hmget(keys.progress(userId), "counted", "claimed"),
        isBanned(canvasId, userId),
      ]);
      const limits: GaugeLimits = {
        gaugeMaxStart: metaNumber(fields, "gaugeMaxStart"),
        gaugeMaxCeiling: metaNumber(fields, "gaugeMaxCeiling"),
      };
      const progress = { countedPixels: Number(counted ?? 0), claimed: Number(claimed ?? 0) };
      const params = {
        gaugeMax: playerGaugeMax(progress.claimed, limits),
        refillMs: metaNumber(fields, "refillMs"),
        refillCharges: metaNumber(fields, "refillCharges"),
      };
      const stored = charges && at ? { charges: Number(charges), at: Number(at) } : undefined;
      const gauge = refillGauge(stored, nowMs, params);
      return {
        charges: gauge.charges,
        max: params.gaugeMax,
        nextRefillAt: gauge.at + params.refillMs,
        claimable: isBannedUser ? 0 : claimableRewards(progress, limits), // A4 : un banni ne réclame rien
      };
    },

    // L'ordre des arguments est celui que lit place.lua.
    async place(canvasId: string, placement: Placement): Promise<Result<AckFrame, CanvasRefusal>> {
      const { userId, requestId, placementId, nowMs, pixels } = placement;
      const keys = buildCanvasKeys(canvasId);
      const [status, ack] = await redis.place(
        keys.meta,
        keys.state,
        keys.version,
        keys.events,
        keys.bans,
        keys.gauge(userId),
        keys.req(userId, requestId),
        keys.cleared,
        keys.clearedPlacements,
        keys.clearedRanges,
        keys.offStream,
        keys.progress(userId),
        keys.scoreboard,
        keys.histPrefix,
        keys.cellsPrefix,
        keys.live,
        userId,
        requestId,
        nowMs,
        PALETTE.length, // §5.3 : pas dans `meta`
        CELL_STRIDE,
        HIST_DEPTH,
        EVENTS_MAXLEN,
        GAUGE_TTL_SECONDS,
        REQ_TTL_SECONDS,
        placementId,
        toParisDay(nowMs), // A3 (JOURNAL 2026-09-30)
        GAUGE_GROWTH_FACTOR,
        COUNTED_PIXELS_PER_DAY,
        SCORE_TIE_SPAN,
        SCORE_MAX_PIXELS,
        TRANSPARENT_COLOR_INDEX,
        ...pixels.flatMap(({ x, y, colorIndex }) => [x, y, colorIndex]),
      );
      if (isRefusal(status)) return { ok: false, error: status };
      const frame = decodeServerFrame(JSON.parse(ack ?? "null"));
      if (frame.ok && frame.value.t === "ack") return { ok: true, value: frame.value };
      throw new Error(`place.lua a renvoyé un ack invalide : ${ack}`);
    },

    // L'ordre des arguments est celui que lit claim.lua.
    async claimGauge(canvasId, { userId, requestId, nowMs }) {
      const keys = buildCanvasKeys(canvasId);
      const [status, ack] = await redis.claim(
        keys.meta,
        keys.bans,
        keys.gauge(userId),
        keys.progress(userId),
        keys.req(userId, requestId),
        userId,
        requestId,
        nowMs,
        GAUGE_GROWTH_FACTOR,
        GAUGE_TTL_SECONDS,
        REQ_TTL_SECONDS,
      );
      if (isRefusal(status)) return { ok: false, error: status };
      const frame = decodeServerFrame(JSON.parse(ack ?? "null"));
      if (frame.ok && frame.value.t === "ack") return { ok: true, value: frame.value };
      throw new Error(`claim.lua a renvoyé un ack invalide : ${ack}`);
    },

    // La tête de `hist:` est le pixel visible (§5.1).
    async inspect(canvasId: string, x: number, y: number): Promise<InspectEntry | null> {
      const head = await redis.lindex(buildCanvasKeys(canvasId).hist(toCellKey(x, y)), 0);
      if (head === null) return null;
      const { authorId: userId, colorIndex, placedAt, placementId } = parseEntry(head);
      // Sans miroir, l'auteur garde au moins son identifiant : le miroir n'expire jamais, c'est un filet.
      const user = await redis.hgetall(userKey(userId));
      return {
        userId,
        login: user.login ?? userId,
        displayName: user.displayName ?? userId,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        colorIndex,
        placedAt,
        placementId,
      };
    },

    // L'ordre des arguments est celui que lit moderate.lua.
    async moderate(
      canvasId: string,
      { by, nowMs, action: moderation, slice, source = "liveplace" }: Moderation,
    ): Promise<Result<ModerationSlice, CanvasRefusal | "forbidden">> {
      const keys = buildCanvasKeys(canvasId);
      const { action, target } = moderation;
      const [placementId, rangeFrom, rangeTo] = placementArgsOf(moderation);
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
        keys.clearedPlacements,
        keys.clearedRanges,
        keys.offStream,
        keys.reported,
        keys.approved,
        keys.recentlyCleared(target),
        keys.scoreboard,
        keys.scoreboardBanned,
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
        placementId,
        rangeFrom,
        rangeTo,
        keys.clearingPrefix,
        keys.reportsPrefix,
        RECENTLY_CLEARED_TTL_SECONDS,
      );
      if (isRefusal(status) || status === "forbidden") return { ok: false, error: status };
      if (status !== "moderated" || version === undefined || cells === undefined)
        throw new Error(`moderate.lua a renvoyé une réponse invalide : ${status}`);
      return { ok: true, value: { version, cells, isDone: isDone === 1 } };
    },

    isBanned,

    // Un banni : sa preuve, figée au ban (§5.1). Sinon : ses pixels visibles, avec leur heure et leur pose.
    async listPixels(canvasId: string, userId: string): Promise<AuthoredPixel[]> {
      const keys = buildCanvasKeys(canvasId);
      if (await isBanned(canvasId, userId)) {
        const proof = await redis.hgetall(keys.ban(userId));
        return Object.entries(proof).map(([cellKey, colorIndex]) => ({
          ...toCell(Number(cellKey)),
          colorIndex: Number(colorIndex),
        }));
      }
      return listVisiblePixels(keys, userId);
    },

    // Triés par nom d'affichage. Sans miroir, le nom Twitch, sinon l'identifiant, comme pour `inspect`.
    async listBans(canvasId: string): Promise<BannedUser[]> {
      const keys = buildCanvasKeys(canvasId);
      const userIds = await redis.smembers(keys.bans);
      const users = await Promise.all(
        userIds.map(async (userId): Promise<BannedUser> => {
          const [profile, pixelCount, isFromTwitch] = await Promise.all([
            getProfile(keys, userId),
            redis.hlen(keys.ban(userId)),
            redis.sismember(keys.bansTwitch, userId),
          ]);
          return { ...profile, pixelCount, isFromTwitch: isFromTwitch === 1 };
        }),
      );
      return users.sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    // L'ordre des arguments est celui que lit report.lua.
    async report(canvasId, { reporterId, x, y, placementId, range, threshold, nowMs }) {
      const keys = buildCanvasKeys(canvasId);
      const status = await redis.report(
        keys.meta,
        keys.version,
        keys.events,
        keys.bans,
        keys.offStream,
        keys.reported,
        keys.approved,
        keys.cleared,
        keys.clearedPlacements,
        keys.clearedRanges,
        keys.histPrefix,
        keys.cellsPrefix,
        keys.clearingPrefix,
        keys.reportsPrefix,
        keys.live,
        reporterId,
        toCellKey(x, y),
        placementId,
        threshold,
        nowMs,
        CELL_STRIDE,
        EVENTS_MAXLEN,
        range?.from ?? "",
        range?.to ?? "",
      );
      if (status === "reported") return { ok: true, value: undefined };
      if (isRefusal(status) || status === "changed" || status === "forbidden")
        return { ok: false, error: status };
      throw new Error(`report.lua a renvoyé une réponse invalide : ${status}`);
    },

    async canReport(canvasId, placement, reporterId) {
      const keys = buildCanvasKeys(canvasId);
      const placementKey = toPlacementKey(placement);
      const results = await redis
        .multi()
        .sismember(keys.reports(placementKey), reporterId)
        .sismember(keys.approved, placementKey)
        .sismember(keys.bans, reporterId)
        .exec();
      if (!results) throw new Error(`canReport ${canvasId} : transaction annulée`);
      return results.every((entry) => unwrap(entry) === 0);
    },

    // Du premier signalement au plus récent. Une pose qui n'a plus de pixel visible est élaguée (JOURNAL 2026-09-28).
    async listReports(canvasId: string): Promise<ReportedPlacement[]> {
      const keys = buildCanvasKeys(canvasId);
      const flat = await redis.zrange(keys.reported, "0", "-1", "WITHSCORES");
      const pixelsByAuthor = new Map<string, Promise<VisiblePixel[]>>();
      const pixelsOf = (authorId: string): Promise<VisiblePixel[]> => {
        const known = pixelsByAuthor.get(authorId);
        if (known) return known;
        const listed = listVisiblePixels(keys, authorId);
        pixelsByAuthor.set(authorId, listed);
        return listed;
      };
      const placementKeys = flat.filter((_, index) => index % 2 === 0);
      const reports = await Promise.all(
        placementKeys.map(async (placementKey, index): Promise<ReportedPlacement | null> => {
          const { authorId, placementId } = toPlacementRef(placementKey);
          const pixels = (await pixelsOf(authorId))
            .filter((pixel) => pixel.placementId === placementId)
            .map(({ x, y, colorIndex }) => ({ x, y, colorIndex }));
          if (pixels.length === 0) return null;
          const [profile, reportCount, isOffStream] = await Promise.all([
            getProfile(keys, authorId),
            redis.scard(keys.reports(placementKey)),
            redis.sismember(keys.offStream, placementKey),
          ]);
          const reportedAt = Number(flat[index * 2 + 1]);
          return { ...profile, placementId, reportCount, reportedAt, isOffStream: isOffStream === 1, pixels };
        }),
      );
      await settleReports(
        keys,
        placementKeys.filter((_, index) => reports[index] === null),
      );
      return reports.filter((report) => report !== null);
    },

    // La pose se relit à la tête de la case : l'identifiant de l'auteur ne quitte jamais le serveur (JOURNAL 2026-09-29).
    async listAuthorPixels(canvasId, x, y, placementId) {
      const keys = buildCanvasKeys(canvasId);
      const head = await redis.lindex(keys.hist(toCellKey(x, y)), 0);
      if (head === null) return null;
      const entry = parseEntry(head);
      return entry.placementId === placementId ? listVisiblePixels(keys, entry.authorId) : null;
    },

    // L'ordre des arguments est celui que lit resize.lua.
    async resizeCanvas(canvasId, { by, width, height }) {
      const keys = buildCanvasKeys(canvasId);
      const [status] = await redis.resize(
        keys.meta,
        keys.state,
        keys.version,
        keys.histPrefix,
        keys.live,
        by,
        width,
        height,
        CELL_STRIDE,
      );
      if (status === "resized") return { ok: true, value: undefined };
      if (isRefusal(status) || status === "forbidden") return { ok: false, error: status };
      throw new Error(`resize.lua a renvoyé une réponse invalide : ${status}`);
    },

    async getReportCount(canvasId: string): Promise<number> {
      return redis.zcard(buildCanvasKeys(canvasId).reported);
    },

    // JOURNAL 2026-10-06 : du plus grand score au plus petit. Un banni n'y est plus, moderate.lua l'a mis à l'écart.
    async listScoreboard(canvasId: string): Promise<ScoreboardEntry[]> {
      const keys = buildCanvasKeys(canvasId);
      const flat = await redis.zrevrange(keys.scoreboard, 0, SCOREBOARD_SIZE - 1, "WITHSCORES");
      const userIds = flat.filter((_, index) => index % 2 === 0);
      return Promise.all(
        userIds.map(async (userId, index): Promise<ScoreboardEntry> => {
          const { login, displayName, avatarUrl } = await getProfile(keys, userId);
          return {
            login,
            displayName,
            ...(avatarUrl ? { avatarUrl } : {}),
            pixels: toScorePixels(Number(flat[index * 2 + 1])),
          };
        }),
      );
    },

    // Une lecture pour tous les joueurs demandés : le rang est celui du classement, sans les bannis.
    async listScoreboardRanks(canvasId, userIds) {
      const ranks = new Map<string, ScoreboardRank>();
      if (userIds.length === 0) return ranks;
      const { scoreboard } = buildCanvasKeys(canvasId);
      const pipeline = redis.pipeline();
      for (const userId of userIds) pipeline.zrevrank(scoreboard, userId).zscore(scoreboard, userId);
      const replies = (await pipeline.exec()) ?? [];
      userIds.forEach((userId, index) => {
        const rank = unwrap(replies[index * 2]);
        const score = unwrap(replies[index * 2 + 1]);
        if (typeof rank === "number" && typeof score === "string")
          ranks.set(userId, { rank: rank + 1, pixels: toScorePixels(Number(score)) });
      });
      return ranks;
    },

    // L'ordre des arguments est celui que lit stream-view.lua.
    async listOffStreamCells(canvasId: string): Promise<OffStreamCell[]> {
      const keys = buildCanvasKeys(canvasId);
      const flat = await redis.streamView(
        keys.cleared,
        keys.clearedPlacements,
        keys.clearedRanges,
        keys.offStream,
        keys.meta,
        keys.histPrefix,
        keys.cellsPrefix,
        keys.clearingPrefix,
        CELL_STRIDE,
      );
      const cells: OffStreamCell[] = [];
      for (let index = 0; index + 2 < flat.length; index += 3) {
        const [x, y, colorIndex] = flat.slice(index, index + 3);
        if (x !== undefined && y !== undefined && colorIndex !== undefined) cells.push({ x, y, colorIndex });
      }
      return cells;
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
      if (isRefusal(status) || status === "forbidden") return { ok: false, error: status };
      if (status !== "ok") throw new Error(`moderators.lua a renvoyé une réponse invalide : ${status}`);
      return { ok: true, value: undefined };
    },

    // Triés par nom d'affichage : le miroir d'un compte, sinon le nom venu de Twitch, sinon l'identifiant.
    async listModerators(canvasId: string): Promise<Moderator[]> {
      const keys = buildCanvasKeys(canvasId);
      const userIds = await redis.smembers(keys.mods);
      const moderators = await Promise.all(
        userIds.map(async (userId): Promise<Moderator> => {
          const [profile, isFromTwitch, isNamedHere] = await Promise.all([
            getProfile(keys, userId),
            redis.sismember(keys.modsTwitch, userId),
            redis.sismember(keys.modsLiveplace, userId),
          ]);
          return { ...profile, isFromTwitch: isFromTwitch === 1, isNamedHere: isNamedHere === 1 };
        }),
      );
      return moderators.sort((left, right) => left.displayName.localeCompare(right.displayName));
    },

    async getModeratorOrigin(canvasId: string, userId: string): Promise<ModeratorOrigin | null> {
      const keys = buildCanvasKeys(canvasId);
      const results = await redis
        .multi()
        .sismember(keys.mods, userId)
        .sismember(keys.modsTwitch, userId)
        .sismember(keys.modsLiveplace, userId)
        .exec();
      if (!results) throw new Error(`getModeratorOrigin ${canvasId} : transaction annulée`);
      const [isModerator, isFromTwitch, isNamedHere] = results.map((entry) => unwrap(entry) === 1);
      return isModerator ? { isFromTwitch: isFromTwitch === true, isNamedHere: isNamedHere === true } : null;
    },

    async getTwitchLive(userId) {
      return (await getTwitchLiveState(redis, userId))?.twitchLive ?? null;
    },

    listTwitchLives: (userIds) => listTwitchLives(redis, userIds),

    // Écrit par le web dans `meta` (createTwitchWrites), lu ici pour l'onglet Modération (JOURNAL 2026-09-27).
    async getTwitchSync(canvasId: string): Promise<TwitchSync | null> {
      const [status, syncedAt] = await redis.hmget(
        buildCanvasKeys(canvasId).meta,
        "twitchSync",
        "twitchSyncedAt",
      );
      if ((status !== "ok" && status !== "revoked") || !syncedAt) return null;
      return { status, syncedAt: Number(syncedAt) };
    },

    // Écart §15 (JOURNAL 2026-10-06) : `HSETNX`, ce que le successeur sait déjà de cette personne reste.
    async copyTwitchUsers(fromCanvasId, toCanvasId, userIds) {
      if (userIds.length === 0) return;
      const names = await redis.hmget(buildCanvasKeys(fromCanvasId).twitchUsers, ...userIds);
      const transaction = redis.multi();
      for (const [index, userId] of userIds.entries()) {
        const name = names[index];
        if (name) transaction.hsetnx(buildCanvasKeys(toCanvasId).twitchUsers, userId, name);
      }
      await transaction.exec();
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
    // §5.3 : rien d'avant une nouvelle taille, ses cases n'ont plus la même place.
    async listRecentEvents(canvasId: string, sinceMs: Timestamp): Promise<Event[]> {
      const keys = buildCanvasKeys(canvasId);
      const [entries, resizedAtVersion] = await Promise.all([
        redis.xrevrange(keys.events, "+", "-", "COUNT", RECENT_MAX_EVENTS),
        redis.hget(keys.meta, "resizedAtVersion"),
      ]);
      const recent: Event[] = [];
      for (const [, fields] of entries) {
        const event = eventOf(fields);
        if (event.occurredAt < sinceMs || event.version <= Number(resizedAtVersion ?? 0)) break;
        recent.push(event);
      }
      return recent.reverse();
    },

    // CDC 2026 §1 : un réglage, pas un pixel. Ni version, ni entrée dans le stream.
    async setObsDelay(canvasId: string, obsDelayMs: number): Promise<void> {
      const keys = buildCanvasKeys(canvasId);
      const control: LiveMessage = { ctl: { t: "obsDelay", obsDelayMs } };
      await redis
        .multi()
        .hset(keys.meta, "obsDelayMs", obsDelayMs)
        .publish(keys.live, JSON.stringify(control))
        .exec();
    },

    // CDC 2026 §1 : comme le délai, `meta` et le `ctl` ensemble, sans version.
    async setObsBackground(canvasId, obsBackground) {
      const keys = buildCanvasKeys(canvasId);
      const control: LiveMessage = { ctl: { t: "obsBackground", obsBackground } };
      await redis
        .multi()
        .hset(keys.meta, "obsBackground", obsBackground)
        .publish(keys.live, JSON.stringify(control))
        .exec();
    },

    // JOURNAL 2026-09-30 : comme le délai. Personne ne perd ce qu'il a réclamé : la jauge max se recalcule.
    async setGaugeLimits(canvasId, limits) {
      const keys = buildCanvasKeys(canvasId);
      const control: LiveMessage = { ctl: { t: "gaugeLimits", ...limits } };
      await redis.multi().hset(keys.meta, limits).publish(keys.live, JSON.stringify(control)).exec();
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
