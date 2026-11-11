// Client typé du noyau Redis (§5.6).

import { readFileSync } from "node:fs";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CanvasCorner,
  type CanvasMeta,
  type CanvasSize,
  CELL_STRIDE,
  COUNTED_PIXELS_PER_DAY,
  cellAt,
  cellKeyAt,
  claimableRewards,
  cornerOf,
  DELETED_AUTHOR,
  DYNAMIC_SIZE_MARGIN,
  FIXED_DEFAULT_CANVAS_SIZE,
  GAUGE_GROWTH_FACTOR,
  type GaugeLimits,
  isBackgroundImageOpacity,
  isDeletedAuthor,
  listPlaneCells,
  OBS_BACKGROUND,
  OBS_BACKGROUNDS,
  PALETTE,
  playerGaugeMax,
  refillGauge,
  SCOREBOARD_SIZE,
  type Timestamp,
  TRANSPARENT_COLOR_INDEX,
  toParisDay,
} from "@liveplace/domain";
import {
  type BadgeId,
  composeBadges,
  parseSupportMirror,
  type SupportMirror,
} from "@liveplace/domain/badges";
import { planDynamicSize, type Reframe } from "@liveplace/domain/dynamic-size";
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
  Pixel,
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
import { planResize, type ResizePlan } from "@liveplace/domain/resize";
import { listCommandAccounts, withoutCommandAccounts } from "@liveplace/domain/twitch-command";
import { decodeServerFrame, type Event } from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";
import type { ChainableCommander, Redis, Result as RedisResult } from "ioredis";
import { createSignupWrites } from "./activity";
import { IS_DELETED_ACCOUNT_LUA, toDeletedAccountFingerprint } from "./deleted-accounts";
import {
  buildCanvasKeys,
  CLEAR_SLICE_CELLS,
  deletedAccountKey,
  EVENTS_MAXLEN,
  GAUGE_TTL_SECONDS,
  HIST_DEPTH,
  PENDING_DELETIONS_KEY,
  RECENT_MAX_EVENTS,
  RECENTLY_CLEARED_TTL_SECONDS,
  REQ_TTL_SECONDS,
  SCORE_MAX_PIXELS,
  SCORE_TIE_SPAN,
  SUPPORT_ENDS_AT_FIELD,
  SUPPORT_TITLE_FIELD,
  TWITCH_COMMANDS_CONSUMER,
  TWITCH_COMMANDS_KEY,
  TWITCH_COMMANDS_MAXLEN,
  TWITCH_COMMANDS_READER,
  TWITCH_MESSAGE_TTL_SECONDS,
  toPlacementKey,
  toPlacementRef,
  toScorePixels,
  twitchMessageKey,
  userKey,
} from "./keys";
import { parsePileEntry } from "./pile-entry";
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
    dynamicSize(...args: (string | number)[]): RedisResult<[status: string, version?: number], Context>;
  }
}

type CanvasKeys = ReturnType<typeof buildCanvasKeys>;

// §5.8 : combien de fois resizeCanvas relit et recalcule son plan avant de rendre `busy`.
const RESIZE_ATTEMPTS = 5;

type PileHead = { authorId: string; colorIndex: number; placedAt: Timestamp; placementId: string };

// Un pixel d'avant le protocole 6 a pour pose sa version.
const parseEntry = (entry: string): PileHead => {
  const { authorId, colorIndex, placedAt, version, placementId } = parsePileEntry(entry);
  return { authorId, colorIndex, placedAt, placementId: placementId ?? String(version) };
};

// Un pixel visible d'un auteur : son heure et sa pose sont connues.
type VisiblePixel = Required<AuthoredPixel>;

type Profile = {
  userId: string;
  login: string;
  displayName: string;
  avatarUrl?: string;
  badges?: BadgeId[]; // absent : aucun
  hasAccount: boolean;
  isDeleted?: true;
};

// §5.4 : la pose visée et sa plage, vides pour les autres actions (moderate.lua).
const placementArgsOf = (action: Moderation["action"]): [string, number | "", number | ""] => {
  if (action.action === "approvePlacement") return [action.placementId, "", ""];
  if (action.action !== "clearPlacement") return ["", "", ""];
  return [action.placementId, action.range?.from ?? "", action.range?.to ?? ""];
};

// Un script qui ne sert pas le canvas le dit par son statut : absent, pas prêt (§5.5), ou archivé (§17.1).
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
// §17.1 : une archive reste prête et se sert ; `archivedAt` la dit, `successorId` où suivre.
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
    // §8.4 : absent, le canvas n'a pas d'image de fond.
    ...(fields.backgroundImageAt === undefined
      ? {}
      : { backgroundImageAt: metaNumber(fields, "backgroundImageAt") }),
    // §9.5 : absente, ou hors des crans, 40 % ; le web sait lire une opacité qui manque.
    ...(fields.backgroundImageOpacity !== undefined &&
    isBackgroundImageOpacity(Number(fields.backgroundImageOpacity))
      ? { backgroundImageOpacity: Number(fields.backgroundImageOpacity) }
      : {}),
    ...(fields.archivedAt === undefined ? {} : { archivedAt: metaNumber(fields, "archivedAt") }),
    ...(fields.successorId === undefined ? {} : { successorId: metaText(fields, "successorId") }),
    // §8.1 : un champ vide vaut pas de thème.
    ...(fields.theme ? { theme: fields.theme } : {}),
    // §5.8 : absent, aucun rapprochement n'a encore déplacé de pixel.
    ...(fields.movedAtVersion === undefined ? {} : { movedAtVersion: metaNumber(fields, "movedAtVersion") }),
    // §5.8 : absents, la taille dynamique est retirée et la fresque n'a jamais été décalée.
    ...(fields.dynamicSize === "1" ? { isDynamicSize: true } : {}),
    ...(fields.originX === undefined
      ? {}
      : { origin: { x: metaNumber(fields, "originX"), y: metaNumber(fields, "originY") } }),
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

// Les trois lectures des badges d'un viewer sur cette fresque, ajoutées à un MULTI ou à un pipeline : le Soutien du miroir `user:`,
// puis le rôle de modérateur et le ban (JOURNAL 2026-11-03). Jamais Convex (D-02).
const BADGE_READS = 3;
const queueBadgeReads = <Chain extends ChainableCommander>(
  chain: Chain,
  keys: CanvasKeys,
  userId: string,
): Chain => {
  chain
    .hmget(userKey(userId), SUPPORT_TITLE_FIELD, SUPPORT_ENDS_AT_FIELD)
    .sismember(keys.mods, userId)
    .sismember(keys.bans, userId);
  return chain;
};

// Les badges lus par ces trois commandes, à l'heure de l'affichage : jamais Modérateur pour un banni (il ne modère pas, §10.3).
const composeBadgesFromReplies = (
  replies: readonly ([Error | null, unknown] | undefined)[],
  from: number,
  nowMs: Timestamp,
): BadgeId[] => {
  const [mirror, isMember, isBannedUser] = [0, 1, 2].map((offset) => unwrap(replies[from + offset]));
  const [title, endsAt] = Array.isArray(mirror) ? mirror : [];
  const support: SupportMirror | null = parseSupportMirror(
    typeof title === "string" ? title : undefined,
    typeof endsAt === "string" ? endsAt : undefined,
  );
  return composeBadges({ isModerator: isMember === 1 && isBannedUser !== 1, support }, nowMs);
};

// Les champs de `meta` tels que Redis les garde : ceux de `CanvasMeta`, sauf le réglage et l'origine de la taille dynamique (§5.8),
// qui s'écrivent sous d'autres noms.
export const toMetaFields = ({
  isDynamicSize,
  origin,
  ...fields
}: CanvasMeta): Record<string, string | number> => ({
  ...fields,
  ...(isDynamicSize ? { dynamicSize: 1 } : {}),
  ...(origin ? { originX: origin.x, originY: origin.y } : {}),
});

// Ce que le web écrit à la connexion (§2) : ni script ni connexion abonnée, il ne pose jamais un pixel.
export function createSignInWrites(redis: Redis): SignInWrites {
  return {
    ...createSignupWrites(redis), // §16.2 : un nouveau compte, à sa première connexion
    // `NX` partout : idempotent, et `ready` n'est jamais remis à 1 sur un canvas en cours de restore.
    // §5.8 : la taille dynamique naît avec le canvas, un canvas qui existe déjà garde son réglage (sans champ : retiré).
    async createCanvas(canvasId: string, meta: CanvasMeta): Promise<void> {
      const keys = buildCanvasKeys(canvasId);
      const isExisting = (await redis.exists(keys.meta)) === 1;
      const transaction = redis.multi();
      for (const [field, value] of Object.entries(
        toMetaFields(isExisting ? { ...meta, isDynamicSize: false } : meta),
      ))
        transaction.hsetnx(keys.meta, field, value);
      await transaction
        .set(keys.state, Buffer.alloc(meta.width * meta.height), "NX")
        .set(keys.version, 0, "NX")
        .hsetnx(keys.meta, "ready", 1)
        .exec();
    },

    // Le Soutien se réécrit à chaque connexion, dans le même HSET : le titre ne baisse jamais et la fin ne recule pas.
    async setUser({ userId, login, displayName, avatarUrl }, support): Promise<void> {
      await redis.hset(userKey(userId), {
        login,
        displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(support ? { [SUPPORT_TITLE_FIELD]: support.title, [SUPPORT_ENDS_AT_FIELD]: support.endsAt } : {}),
      });
    },
  };
}

// CDC §8, Supprimer son compte (JOURNAL 2026-11-02) : ce que Twitch nomme d'un compte supprimé et livre après la purge de Redis ne s'écrit
// pas, ni son nom ni l'action qui le vise. La garde est celle du suivi du live (`isDeletedAccount`), lue dans le même script que
// l'écriture : l'effacement ne passe pas entre les deux.

// KEYS : la file, l'effacement en cours, puis pour chaque compte son empreinte et son miroir ; ARGV : la taille de la file, l'action en
// JSON, puis les comptes. Rend les comptes supprimés que l'action nomme : sans eux elle est écrite, avec eux rien ne l'est.
const QUEUE_COMMAND = `${IS_DELETED_ACCOUNT_LUA}
local deleted = {}
for index = 3, #ARGV do
  local offset = 2 * (index - 2)
  if isDeletedAccount(ARGV[index], KEYS[2], KEYS[offset + 1], KEYS[offset + 2]) then
    deleted[#deleted + 1] = ARGV[index]
  end
end
if #deleted == 0 then
  redis.call("XADD", KEYS[1], "MAXLEN", "~", ARGV[1], "*", "c", ARGV[2])
end
return deleted`;

// KEYS : la table des noms, l'effacement en cours, puis pour chaque compte son empreinte et son miroir ; ARGV : pour chaque compte
// son identifiant puis son nom en JSON. Le nom d'un compte supprimé n'y entre pas.
const NAME_USERS = `${IS_DELETED_ACCOUNT_LUA}
for index = 1, #ARGV, 2 do
  if not isDeletedAccount(ARGV[index], KEYS[2], KEYS[index + 2], KEYS[index + 3]) then
    redis.call("HSET", KEYS[1], ARGV[index], ARGV[index + 1])
  end
end
return 1`;

// Les clés que la garde lit pour ces comptes, dans l'ordre des scripts : l'effacement en cours, puis l'empreinte et le miroir de chacun.
const guardKeysOf = (secret: string, userIds: readonly string[]): string[] => [
  PENDING_DELETIONS_KEY,
  ...userIds.flatMap((userId) => [
    deletedAccountKey(toDeletedAccountFingerprint(secret, userId)),
    userKey(userId),
  ]),
];

const toUserIds = (reply: unknown): string[] => {
  if (!Array.isArray(reply) || !reply.every((item) => typeof item === "string"))
    throw new Error("réponse Redis : une liste de comptes était attendue");
  return reply;
};

// Une action écrite si aucun de ses comptes n'est supprimé ; sinon sans eux, et rien du tout pour une action sur eux seuls.
const queueCommand = async (redis: Redis, secret: string, command: TwitchCommand): Promise<void> => {
  for (let current: TwitchCommand | null = command; current; ) {
    const userIds = [...new Set(listCommandAccounts(current))];
    const deleted = toUserIds(
      await redis.eval(
        QUEUE_COMMAND,
        1 + 1 + 2 * userIds.length,
        TWITCH_COMMANDS_KEY,
        ...guardKeysOf(secret, userIds),
        TWITCH_COMMANDS_MAXLEN,
        JSON.stringify(current),
        ...userIds,
      ),
    );
    if (deleted.length === 0) return;
    current = withoutCommandAccounts(current, new Set(deleted));
  }
};

// §2 : des noms et des actions à appliquer, jamais un pixel ni un script. `secret` : celui des sessions, dont l'empreinte d'un compte
// supprimé découle (deleted-accounts.ts).
export function createTwitchWrites(redis: Redis, secret: string): TwitchWrites {
  return {
    async setTwitchUsers(canvasId, users) {
      if (users.length === 0) return;
      const userIds = users.map(({ userId }) => userId);
      await redis.eval(
        NAME_USERS,
        1 + 1 + 2 * userIds.length,
        buildCanvasKeys(canvasId).twitchUsers,
        ...guardKeysOf(secret, userIds),
        ...users.flatMap(({ userId, login, displayName }) => [
          userId,
          JSON.stringify({ login, displayName }),
        ]),
      );
    },

    async setTwitchSync(canvasId, { status, syncedAt }) {
      await redis.hset(buildCanvasKeys(canvasId).meta, { twitchSync: status, twitchSyncedAt: syncedAt });
    },

    async queueTwitchCommands(commands) {
      for (const command of commands) await queueCommand(redis, secret, command);
    },

    // `NX` : le premier message de cet identifiant gagne, une redélivrance trouve la clé posée (JOURNAL 2026-10-08).
    async reserveTwitchMessage(messageId) {
      return (
        (await redis.set(twitchMessageKey(messageId), 1, "EX", TWITCH_MESSAGE_TTL_SECONDS, "NX")) === "OK"
      );
    },

    async releaseTwitchMessage(messageId) {
      await redis.del(twitchMessageKey(messageId));
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
  let pendingFrom = "0"; // après la dernière action non acquittée rendue : une action gardée sans acquit ne bloque pas la suite

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
      pendingFrom,
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

  const listNext = async (blockMs: number) => {
    await ensureReader();
    if (!isRecovered) {
      const pending = streamEntriesOf(await listUnacknowledged());
      const last = pending.at(-1);
      if (last) {
        pendingFrom = last.id;
        return pending;
      }
      isRecovered = true;
    }
    return streamEntriesOf(await listUnread(blockMs));
  };

  return {
    async listTwitchCommands(blockMs) {
      try {
        return await listNext(blockMs);
      } catch (error) {
        // NOGROUP : le groupe est parti. UNBLOCKED : le flux est supprimé pendant que la lecture l'attendait.
        const isReaderLost = error instanceof Error && /^(NOGROUP|UNBLOCKED)/.test(error.message);
        if (!isReaderLost) throw error;
        // §7.1 : Redis a tout perdu, le groupe avec : il se refait, sans arrêter le gateway.
        hasReader = false;
        isRecovered = false;
        pendingFrom = "0";
        return listNext(blockMs);
      }
    },

    async ackTwitchCommand(id) {
      await redis.xack(TWITCH_COMMANDS_KEY, TWITCH_COMMANDS_READER, id);
    },
  };
}

const PILE_HEADS_PER_PIPELINE = 2048; // une tranche de têtes de pile par aller-retour : Redis reprend la main entre deux

// Le coin du cadre sur la grille des clés (JOURNAL 2026-11-05) : absent de `meta`, (0, 0).
export const getCorner = async (redis: Redis, keys: CanvasKeys): Promise<CanvasCorner> => {
  const [cornerX, cornerY] = await redis.hmget(keys.meta, "cornerX", "cornerY");
  return cornerOf({ cornerX, cornerY });
};

// Les pixels hors du cadre `from` (JOURNAL 2026-11-05), en coordonnées du cadre : la tête colorée de chaque pile du plan de grille qui
// n'est pas dans le cadre. Ils restent à droite ou en bas du cadre : une pile à sa gauche ou au-dessus, rendue visible par une modération,
// n'est pas lue. Lus après la version de `getPlanInput` : une pose ou une modération entre-temps fait refuser le plan.
const listPixelsOutsideFrame = async (
  redis: Redis,
  keys: CanvasKeys,
  from: CanvasSize,
  corner: CanvasCorner,
): Promise<Pixel[]> => {
  const cells = listPlaneCells(corner)
    .map(({ x, y }) => ({ x: x - corner.x, y: y - corner.y }))
    .filter(({ x, y }) => x >= 0 && y >= 0 && (x >= from.width || y >= from.height));
  const outside: Pixel[] = [];
  for (let start = 0; start < cells.length; start += PILE_HEADS_PER_PIPELINE) {
    const slice = cells.slice(start, start + PILE_HEADS_PER_PIPELINE);
    const pipeline = redis.pipeline();
    for (const { x, y } of slice) pipeline.lindex(keys.hist(cellKeyAt(corner, x, y)), 0);
    const replies = await pipeline.exec();
    slice.forEach(({ x, y }, index) => {
      const head = unwrap(replies?.[index]);
      const colorIndex = typeof head === "string" ? parsePileEntry(head).colorIndex : TRANSPARENT_COLOR_INDEX;
      if (colorIndex !== TRANSPARENT_COLOR_INDEX) outside.push({ x, y, colorIndex });
    });
  }
  return outside;
};

// §5.8 : `state`, la taille et la version lus d'un seul MULTI, de quoi calculer le plan d'une nouvelle taille ; puis, si la fresque
// a déjà changé de taille, ses pixels hors du cadre. Sans `input`, le canvas n'est pas prêt : le script le dit avant de lire le plan.
const getPlanInput = async (
  redis: Redis,
  keys: CanvasKeys,
  name: string,
): Promise<{ version: number; input: { state: Buffer; from: CanvasSize; cut: Pixel[] } | null }> => {
  const results = await redis
    .multi()
    .getBuffer(keys.state)
    .get(keys.version)
    .hmget(keys.meta, "width", "height", "resizedAtVersion", "cornerX", "cornerY")
    .exec();
  if (!results) throw new Error(`${name} ${keys.prefix} : transaction annulée`);
  const [state, version, fields] = results.map(unwrap);
  const [width, height, resizedAtVersion, cornerX, cornerY] = Array.isArray(fields) ? fields : [];
  const from = width != null && height != null ? { width: Number(width), height: Number(height) } : null;
  const isReadable = Buffer.isBuffer(state) && from !== null && state.length === from.width * from.height;
  if (!isReadable) return { version: Number(version ?? 0), input: null };
  const cut =
    resizedAtVersion == null
      ? []
      : await listPixelsOutsideFrame(redis, keys, from, cornerOf({ cornerX, cornerY }));
  return { version: Number(version ?? 0), input: { state, from, cut } };
};

// Sans plan (`null`), la taille ne change pas : resize.lua le dit avant de le lire.
const getResizePlan = async (
  redis: Redis,
  keys: CanvasKeys,
  to: CanvasSize,
): Promise<{ version: number; plan: ResizePlan | null }> => {
  const { version, input } = await getPlanInput(redis, keys, "resizeCanvas");
  const isChanging = input !== null && (input.from.width !== to.width || input.from.height !== to.height);
  return { version, plan: input && isChanging ? planResize(input.state, input.from, to, input.cut) : null };
};

// §5.8 : ce que change le réglage, du même état lu. Activé : le resserrement sur les dessins
// (`reframe`). Retiré : le retour à la taille fixe par défaut par le plan de taille d'un format (`resize`, absent si la fresque y est déjà).
// Sans plan, un canvas pas prêt.
type DynamicPlan = { reframe: Reframe; resize: ResizePlan | null };
const getDynamicPlan = async (
  redis: Redis,
  keys: CanvasKeys,
  isDynamicSize: boolean,
): Promise<{ version: number; plan: DynamicPlan | null }> => {
  const { version, input } = await getPlanInput(redis, keys, "setDynamicSize");
  if (!input) return { version, plan: null };
  if (isDynamicSize)
    return { version, plan: { reframe: planDynamicSize(input.state, input.from, input.cut), resize: null } };
  const isFixedDefaultSize =
    input.from.width === FIXED_DEFAULT_CANVAS_SIZE.width &&
    input.from.height === FIXED_DEFAULT_CANVAS_SIZE.height;
  return {
    version,
    plan: {
      reframe: { ...FIXED_DEFAULT_CANVAS_SIZE, dx: 0, dy: 0 },
      resize: isFixedDefaultSize
        ? null
        : planResize(input.state, input.from, FIXED_DEFAULT_CANVAS_SIZE, input.cut),
    },
  };
};

// L'ordre des arguments est celui que lit dynamic-size.lua. `stale` : une pose a couru entre la lecture et le script.
const tryDynamicSize = async (
  redis: Redis,
  keys: CanvasKeys,
  by: string,
  isDynamicSize: boolean,
): Promise<string> => {
  const { version, plan } = await getDynamicPlan(redis, keys, isDynamicSize);
  const [status] = await redis.dynamicSize(
    keys.meta,
    keys.state,
    keys.version,
    keys.histPrefix,
    keys.cellsPrefix,
    keys.clearingPrefix,
    keys.live,
    CELL_STRIDE,
    by,
    isDynamicSize ? 1 : 0,
    version,
    plan?.reframe.dx ?? "",
    plan?.reframe.dy ?? "",
    plan?.reframe.width ?? "",
    plan?.reframe.height ?? "",
    plan?.resize ? JSON.stringify(plan.resize) : "",
  );
  return status;
};

// L'ordre des arguments est celui que lit resize.lua. Un essai : lit le plan, puis l'applique. `stale` : une pose a couru entre les deux.
const tryResize = async (redis: Redis, keys: CanvasKeys, by: string, to: CanvasSize): Promise<string> => {
  const { version, plan } = await getResizePlan(redis, keys, to);
  const [status] = await redis.resize(
    keys.meta,
    keys.state,
    keys.version,
    keys.histPrefix,
    keys.live,
    by,
    to.width,
    to.height,
    CELL_STRIDE,
    keys.cellsPrefix,
    keys.clearingPrefix,
    version,
    JSON.stringify(plan),
  );
  return status;
};

const scriptOf = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

// `now` : l'heure à laquelle un badge s'éteint se compare à celle de l'affichage (JOURNAL 2026-11-03).
export function createCanvasCore(
  redis: Redis,
  liveSubscriber: Redis,
  now: () => Timestamp = Date.now,
): CanvasCore {
  // §5.4 : pile.lua, collé devant chaque script qui lit une pile.
  const pile = scriptOf("pile.lua");
  const withPile = (name: string): string => `${pile}\n${scriptOf(name)}`;
  // §5.3 : gauge.lua, collé devant les deux scripts qui écrivent une jauge.
  const gauge = scriptOf("gauge.lua");
  // §5.8 : pile-moves.lua, collé après pile.lua devant les scripts qui déplacent des piles, et reframe.lua
  // devant ceux qui agrandissent ou resserrent la fresque.
  const moves = `${pile}\n${scriptOf("pile-moves.lua")}`;
  const withResize = (name: string): string => `${moves}\n${scriptOf("resize-plan.lua")}\n${scriptOf(name)}`;
  const withReframe = (name: string): string => `${pile}\n${scriptOf("reframe.lua")}\n${scriptOf(name)}`;
  redis.defineCommand("place", { numberOfKeys: 13, lua: `${gauge}\n${withReframe("place.lua")}` });
  redis.defineCommand("claim", { numberOfKeys: 5, lua: `${gauge}\n${scriptOf("claim.lua")}` });
  redis.defineCommand("moderate", { numberOfKeys: 20, lua: withReframe("moderate.lua") });
  redis.defineCommand("moderators", { numberOfKeys: 5, lua: scriptOf("moderators.lua") });
  redis.defineCommand("report", { numberOfKeys: 10, lua: withPile("report.lua") });
  redis.defineCommand("streamView", { numberOfKeys: 5, lua: withPile("stream-view.lua") });
  redis.defineCommand("resize", { numberOfKeys: 3, lua: withResize("resize.lua") });
  redis.defineCommand("dynamicSize", {
    numberOfKeys: 3,
    lua: `${moves}\n${scriptOf("resize-plan.lua")}\n${scriptOf("reframe.lua")}\n${scriptOf("dynamic-size.lua")}`,
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

  // Les badges d'un viewer sur cette fresque : un MULTI de ses trois lectures.
  const getBadgesOf = async (keys: CanvasKeys, userId: string): Promise<BadgeId[]> => {
    const results = await queueBadgeReads(redis.multi(), keys, userId).exec();
    if (!results) throw new Error(`getBadges ${keys.prefix} : transaction annulée`);
    return composeBadgesFromReplies(results, 0, now());
  };

  // Le nom d'une personne : le miroir de son compte, sinon le nom venu de Twitch, sinon l'identifiant, comme `inspect`.
  // CDC §8 : l'auteur d'un compte supprimé n'a pas de nom, et se dit tel.
  const getProfile = async (keys: CanvasKeys, userId: string): Promise<Profile> => {
    if (isDeletedAuthor(userId))
      return { userId, login: "", displayName: "", hasAccount: false, isDeleted: true };
    const [user, twitchUser, badges] = await Promise.all([
      redis.hgetall(userKey(userId)),
      redis.hget(keys.twitchUsers, userId),
      getBadgesOf(keys, userId),
    ]);
    const hasAccount = user.login !== undefined;
    const named = hasAccount ? user : twitchNameOf(twitchUser);
    return {
      userId,
      login: named.login ?? userId,
      displayName: named.displayName ?? userId,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(badges.length > 0 ? { badges } : {}),
      hasAccount,
    };
  };

  // Un seul MULTI : `mods` et ses deux origines se lisent du même instant. `null` : pas modérateur.
  const getModeratorOriginOf = async (keys: CanvasKeys, userId: string): Promise<ModeratorOrigin | null> => {
    const results = await redis
      .multi()
      .sismember(keys.mods, userId)
      .sismember(keys.modsTwitch, userId)
      .sismember(keys.modsLiveplace, userId)
      .exec();
    if (!results) throw new Error(`getModeratorOrigin ${keys.prefix} : transaction annulée`);
    const [isModerator, isFromTwitch, isNamedHere] = results.map((entry) => unwrap(entry) === 1);
    return isModerator ? { isFromTwitch: isFromTwitch === true, isNamedHere: isNamedHere === true } : null;
  };

  // Les cases dont il est l'auteur visible, retrait interrompu compris, lues à la tête de leur pile. §5.7 : dans le
  // cadre seulement.
  const listVisiblePixels = async (keys: CanvasKeys, userId: string): Promise<VisiblePixel[]> => {
    const [cellKeys, [width, height, cornerX, cornerY]] = await Promise.all([
      redis.sunion(keys.cells(userId), keys.clearing(userId)),
      redis.hmget(keys.meta, "width", "height", "cornerX", "cornerY"),
    ]);
    const corner = cornerOf({ cornerX, cornerY });
    const cells = cellKeys
      .map((cellKey) => ({ cellKey, ...cellAt(corner, Number(cellKey)) }))
      .filter(({ x, y }) => x >= 0 && x < Number(width) && y >= 0 && y < Number(height));
    const pipeline = redis.pipeline();
    for (const { cellKey } of cells) pipeline.lindex(`${keys.histPrefix}${cellKey}`, 0);
    const heads = cells.length > 0 ? ((await pipeline.exec()) ?? []) : [];
    return cells.flatMap(({ x, y }, index) => {
      const head = unwrap(heads[index]);
      if (typeof head !== "string") return [];
      const { authorId, colorIndex, placedAt, placementId } = parseEntry(head);
      return authorId === userId ? [{ x, y, colorIndex, placedAt, placementId }] : [];
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
    // `ready` à 0, posé par la récupération : un canvas absent, ou neuf d'un archivage (sans `ready`), n'en est pas un.
    isRecovering: async (canvasId: string): Promise<boolean> =>
      (await redis.hget(buildCanvasKeys(canvasId).meta, "ready")) === "0",

    // §10.3 : un banni ne modère pas, même modérateur Twitch ; un MULTI, comme getModeratorOrigin.
    async isModerator(canvasId: string, userId: string): Promise<boolean> {
      const keys = buildCanvasKeys(canvasId);
      const results = await redis.multi().sismember(keys.mods, userId).sismember(keys.bans, userId).exec();
      if (!results) throw new Error(`isModerator ${canvasId} : transaction annulée`);
      const [isMember, isBannedUser] = results.map((entry) => unwrap(entry) === 1);
      return isMember === true && isBannedUser !== true;
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
      const { userId, requestId, placementId, nowMs, origin, pixels } = placement;
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
        origin?.x ?? "", // sans origine, les pixels sont déjà dans le repère de la fresque
        origin?.y ?? "",
        DYNAMIC_SIZE_MARGIN,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
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
      const keys = buildCanvasKeys(canvasId);
      const head = await redis.lindex(keys.hist(cellKeyAt(await getCorner(redis, keys), x, y)), 0);
      if (head === null) return null;
      const { authorId: userId, colorIndex, placedAt, placementId } = parseEntry(head);
      // CDC §8 : le pixel d'un compte supprimé garde sa couleur et sa date, jamais un nom.
      if (isDeletedAuthor(userId))
        return { userId, login: "", displayName: "", isDeleted: true, colorIndex, placedAt, placementId };
      // Sans miroir, l'auteur garde au moins son identifiant : le miroir n'expire jamais, c'est un filet.
      const [user, badges] = await Promise.all([redis.hgetall(userKey(userId)), getBadgesOf(keys, userId)]);
      return {
        userId,
        login: user.login ?? userId,
        displayName: user.displayName ?? userId,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        ...(badges.length > 0 ? { badges } : {}),
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
        keys.modsLiveplace,
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
        DYNAMIC_SIZE_MARGIN,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        DELETED_AUTHOR,
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
        const [proof, corner] = await Promise.all([redis.hgetall(keys.ban(userId)), getCorner(redis, keys)]);
        return Object.entries(proof).map(([cellKey, colorIndex]) => ({
          ...cellAt(corner, Number(cellKey)),
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
        x,
        y,
        placementId,
        threshold,
        nowMs,
        CELL_STRIDE,
        EVENTS_MAXLEN,
        range?.from ?? "",
        range?.to ?? "",
        DELETED_AUTHOR,
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
          const [profile, reportCount, isOffStream, moderatorOrigin] = await Promise.all([
            getProfile(keys, authorId),
            redis.scard(keys.reports(placementKey)),
            redis.sismember(keys.offStream, placementKey),
            getModeratorOriginOf(keys, authorId),
          ]);
          const reportedAt = Number(flat[index * 2 + 1]);
          return {
            ...profile,
            ...(moderatorOrigin ? { moderatorOrigin } : {}), // §4.3 : Bannir se cache
            placementId,
            reportCount,
            reportedAt,
            isOffStream: isOffStream === 1,
            pixels,
          };
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
      const head = await redis.lindex(keys.hist(cellKeyAt(await getCorner(redis, keys), x, y)), 0);
      if (head === null) return null;
      const entry = parseEntry(head);
      return entry.placementId === placementId ? listVisiblePixels(keys, entry.authorId) : null;
    },

    // §5.8 : le plan se calcule ici sur `state`, lu avec la version ; resize.lua le refuse (`stale`)
    // si une pose a couru depuis, et on le recalcule.
    async resizeCanvas(canvasId, { by, width, height }) {
      const keys = buildCanvasKeys(canvasId);
      for (let attempt = 0; attempt < RESIZE_ATTEMPTS; attempt++) {
        const status = await tryResize(redis, keys, by, { width, height });
        if (status === "resized") return { ok: true, value: undefined };
        if (isRefusal(status) || status === "forbidden") return { ok: false, error: status };
        if (status !== "stale") throw new Error(`resize.lua a renvoyé une réponse invalide : ${status}`);
      }
      return { ok: false, error: "busy" };
    },

    // §5.8 : de même que la taille, le plan se relit si une pose a couru.
    async setDynamicSize(canvasId, { by, isDynamicSize }) {
      const keys = buildCanvasKeys(canvasId);
      for (let attempt = 0; attempt < RESIZE_ATTEMPTS; attempt++) {
        const status = await tryDynamicSize(redis, keys, by, isDynamicSize);
        if (status === "set") return { ok: true, value: undefined };
        if (isRefusal(status) || status === "forbidden") return { ok: false, error: status };
        if (status !== "stale")
          throw new Error(`dynamic-size.lua a renvoyé une réponse invalide : ${status}`);
      }
      return { ok: false, error: "busy" };
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
          const { login, displayName, avatarUrl, badges } = await getProfile(keys, userId);
          return {
            login,
            displayName,
            ...(avatarUrl ? { avatarUrl } : {}),
            ...(badges ? { badges } : {}),
            pixels: toScorePixels(Number(flat[index * 2 + 1])),
          };
        }),
      );
    },

    // Une lecture pour tous les joueurs demandés : le rang est celui du classement, sans les bannis. Leurs badges (ceux de « ta place »)
    // se lisent dans le même pipeline : un seul aller-retour vers Redis, quel que soit le nombre de viewers (JOURNAL 2026-11-03).
    async listScoreboardRanks(canvasId, userIds) {
      const ranks = new Map<string, ScoreboardRank>();
      if (userIds.length === 0) return ranks;
      const keys = buildCanvasKeys(canvasId);
      const pipeline = redis.pipeline();
      for (const userId of userIds) {
        pipeline.zrevrank(keys.scoreboard, userId).zscore(keys.scoreboard, userId);
        queueBadgeReads(pipeline, keys, userId);
      }
      const replies = (await pipeline.exec()) ?? [];
      const nowMs = now();
      const stride = 2 + BADGE_READS;
      userIds.forEach((userId, index) => {
        const first = index * stride;
        const rank = unwrap(replies[first]);
        const score = unwrap(replies[first + 1]);
        if (typeof rank !== "number" || typeof score !== "string") return;
        const badges = composeBadgesFromReplies(replies, first + 2, nowMs);
        ranks.set(userId, {
          rank: rank + 1,
          pixels: toScorePixels(Number(score)),
          ...(badges.length > 0 ? { badges } : {}),
        });
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
        keys.bans,
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

    getModeratorOrigin: (canvasId: string, userId: string) =>
      getModeratorOriginOf(buildCanvasKeys(canvasId), userId),

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

    // §17.1 : `HSETNX`, ce que le successeur sait déjà de cette personne reste.
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

    // §9.5 : comme le fond, `meta` et le `ctl` ensemble, sans version.
    async setBackgroundImageOpacity(canvasId, backgroundImageOpacity) {
      const keys = buildCanvasKeys(canvasId);
      const control: LiveMessage = { ctl: { t: "backgroundImageOpacity", backgroundImageOpacity } };
      await redis
        .multi()
        .hset(keys.meta, "backgroundImageOpacity", backgroundImageOpacity)
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
