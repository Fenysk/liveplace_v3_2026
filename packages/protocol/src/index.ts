// Frames client ↔ serveur, schémas Zod, version du protocole (§4).

import {
  ACTIVITY_PERIODS,
  CANVAS_STATUSES,
  DEVICES,
  isCanvasSize,
  isGaugeLimits,
  isObsDelayStep,
  OBS_BACKGROUNDS,
  ROLES,
  SCOREBOARD_SIZE,
  THEME_MAX_LENGTH,
  type Timestamp,
} from "@liveplace/domain";
import { CAPACITY_LINKS, CAPACITY_RESOURCE_IDS, CAPACITY_UNITS } from "@liveplace/domain/capacity";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

// --- Constantes et types de base --------------------------------------

// 2 : cinq frames de modération, `cursor` et `clearArea` retirés. 3 : le délai OBS à chaud (JOURNAL 2026-09-25).
// 4 : l'identifiant de l'auteur inspecté devient optionnel, et une `error` peut nommer sa requête (JOURNAL 2026-09-27).
// 5 : le rôle se relit en direct (frame `role`), et les modérateurs se listent (JOURNAL 2026-09-27).
// 6 : la pose, le signalement et la case vue par le stream (JOURNAL 2026-09-28).
// 7 : signaler une plage d'heures, et les pixels de l'auteur d'une pose pour la choisir (JOURNAL 2026-09-29).
// 8 : le streamer change la taille de son canvas (JOURNAL 2026-09-29).
// 9 : le fond de la vue OBS, transparent ou blanc (JOURNAL 2026-09-29).
// 11 : une liste de l'onglet Modération se périme en direct, frame `staleList` (JOURNAL 2026-10-06).
// 12 : le classement du canvas et la place de chaque page, frame `scoreboard` (JOURNAL 2026-10-06).
// 13 : le développeur suit l'activité, `watchActivity`, `listActivityHistory`, `activity`, `activityHistory` (JOURNAL 2026-10-06).
// 14 : l'archive en lecture seule, la frame qui annonce le statut d'un canvas (Écart §15, JOURNAL 2026-10-06), et le fond
// noir de la vue OBS.
// 15 : le développeur suit la capacité, `watchCapacity`, `listCapacityHistory`, `capacity`, `capacityHistory` (JOURNAL 2026-10-07).
// 16 : le thème du canvas, dans le `welcome` et dans la frame `theme` (Écart §4.3, JOURNAL 2026-10-07).
// 17 : le live Twitch d'un compte, dans le `welcome`, l'`inspected` et la frame `twitchLive` (Écart §4 et §10.1, JOURNAL 2026-10-07).
export const PROTOCOL_VERSION = 17;

// --- Types internes (§4.4) — jamais envoyés tels quels au client -------
// Event vit dans le Redis Stream et dans l'archive Convex. CellsFrame est
// la seule forme que le client connaît : le worker/gateway traduit l'un
// vers l'autre, sans jamais laisser `authorId` ni `moderation` franchir le fil.

// §4.3 : `hide` et `unhide` ne changent que ce que montre le stream.
export type EventKind = "place" | "clear" | "hide" | "unhide";

export type Event = {
  version: number;
  kind: EventKind;
  authorId: string | null; // null = système
  occurredAt: Timestamp;
  cells: EventCell[];
  // §4.4 : plus de `clearArea`, donc plus d'`area`.
  moderation?: {
    action: ModerateAction["action"];
    target: string;
    placementId?: string; // `clearPlacement` et `approvePlacement` (JOURNAL 2026-09-28)
  };
};

// §9.5 : la case vue par le stream, quand une pose cachée est en jeu.
export type StreamCell = {
  colorIndex: number;
  previousColorIndex: number;
  placedAt: Timestamp;
};

export type EventCell = {
  x: number;
  y: number;
  colorIndex: number; // la couleur désormais visible
  previousColorIndex: number; // celle qui était visible avant
  placedAt: Timestamp; // date de pose du pixel désormais visible
  obs?: StreamCell | undefined; // absente : le stream voit la même chose que la page (Zod la type ainsi)
};

export type CellsFrame = {
  toVersion: number; // version du canvas après la dernière case du lot
  cells: BroadcastCell[]; // ordonnées par version croissante
};

export type BroadcastCell = EventCell & {
  version: number; // la version de CETTE case
  kind: EventKind; // le genre de CETTE case
};

// --- Fragments Zod partagés ---------------------------------------------
// Nommés et réutilisés entre frames pour rester sous le seuil de duplication
// du gate (§14) : un même champ (requestId, coordonnée, version...) n'est
// écrit qu'une fois.

const RequestIdSchema = z.string();
const CanvasIdSchema = z.string();
const UserIdSchema = z.string();
const TwitchLoginSchema = z.string();
const DisplayNameSchema = z.string();
const TimestampSchema = z.number();
const VersionSchema = z.number().int().nonnegative();
const CoordinateSchema = z.number().int().nonnegative();
const ColorIndexSchema = z.number().int().min(0).max(255);
const RoleSchema = z.enum(ROLES);
// §5.1 : tirée par la page, elle commence par une lettre ; un pixel plus ancien a sa version.
const ClientPlacementIdSchema = z.string().regex(/^[a-z][a-z0-9]{7,31}$/);
const PlacementIdSchema = z.union([ClientPlacementIdSchema, z.string().regex(/^\d{1,16}$/)]);

const PixelSchema = z.object({
  x: CoordinateSchema,
  y: CoordinateSchema,
  colorIndex: ColorIndexSchema,
});

const GaugeSchema = z.object({
  charges: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  nextRefillAt: TimestampSchema,
  claimable: z.number().int().nonnegative(), // JOURNAL 2026-09-30 : les récompenses à réclamer
});

const StreamCellSchema = z.object({
  colorIndex: ColorIndexSchema,
  previousColorIndex: ColorIndexSchema,
  placedAt: TimestampSchema,
});

const BroadcastCellSchema = StreamCellSchema.extend({
  x: CoordinateSchema,
  y: CoordinateSchema,
  obs: StreamCellSchema.optional(),
  version: VersionSchema,
  kind: z.enum(["place", "clear", "hide", "unhide"]),
});

const CellsPayloadSchema = z.object({
  toVersion: VersionSchema,
  cells: z.array(BroadcastCellSchema),
});

const RejectedPixelSchema = z.object({
  index: z.number().int().nonnegative(),
  reason: z.string(),
});

// L'origine d'un rôle de modérateur : nommé sur Twitch, ici, ou les deux (JOURNAL 2026-09-27).
const ModeratorOriginSchema = z.object({ isFromTwitch: z.boolean(), isNamedHere: z.boolean() });

// Écart §4.3 (JOURNAL 2026-10-07) : le live Twitch d'un compte ; `category` vide : le stream n'en a pas. Absent : hors live.
const TwitchLiveSchema = z.object({ category: z.string() });

const InspectEntrySchema = z.object({
  userId: UserIdSchema.optional(), // §4.3 : seulement pour qui modère
  moderatorOrigin: ModeratorOriginSchema.optional(), // pour qui modère (Écart §4.3, JOURNAL 2026-10-08), quand l'auteur est modérateur
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(), // §4.3 : un ancien client l'ignore
  twitchLive: TwitchLiveSchema.optional(), // Écart §4.3 (JOURNAL 2026-10-07) : lu à l'inspection
  colorIndex: ColorIndexSchema,
  placedAt: TimestampSchema,
  placementId: PlacementIdSchema, // §4.3 : la pose, pour la signaler ou la retirer
  canReport: z.boolean().optional(), // absent : ne peut pas la signaler
});

const ErrorCodeSchema = z.enum([
  "protocol_version",
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "invalid_frame",
  "canvas_not_found",
  "canvas_archived", // Écart §15 (JOURNAL 2026-10-06) : une écriture sur une archive, refusée sans fermer la connexion
  "server_full",
]);

// --- Frames client → serveur (§4.2) -------------------------------------
// JOURNAL 2026-09-29 (audit de sécurité §4) : strictes, une clé inconnue rend la frame invalide.

const HelloFrameSchema = z.strictObject({
  t: z.literal("hello"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  canvasId: CanvasIdSchema,
  mode: z.enum(["ui", "obs"]),
  lastVersion: VersionSchema.optional(),
});

const PlaceFrameSchema = z.strictObject({
  t: z.literal("place"),
  requestId: RequestIdSchema,
  placementId: ClientPlacementIdSchema, // le même pour chaque lot d'un brouillon validé (JOURNAL 2026-09-28)
  pixels: z.array(z.strictObject(PixelSchema.shape)).min(1).max(64), // strict ici seulement : `PixelSchema` sert aussi au serveur
});

const InspectFrameSchema = z.strictObject({
  t: z.literal("inspect"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
});

// §5.4 : les autres pixels de l'auteur posés entre `from` et `to`, autour d'une pose.
const RangeSchema = z
  .strictObject({ from: TimestampSchema, to: TimestampSchema })
  .refine(({ from, to }) => from <= to, "plage à l'envers");

// §5.4 et §4.2 : pas de `cursor`, le gateway enchaîne les tranches ; plus de `clearArea`.
const ModerateActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.enum(["clearUser", "ban", "unban"]), target: UserIdSchema }),
  z.strictObject({
    action: z.literal("clearPlacement"),
    target: UserIdSchema,
    placementId: PlacementIdSchema,
    range: RangeSchema.optional(),
  }),
  z.strictObject({
    action: z.literal("approvePlacement"),
    target: UserIdSchema,
    placementId: PlacementIdSchema,
  }),
]);

export type ModerateAction = z.infer<typeof ModerateActionSchema>;

const ModerateFrameSchema = z.strictObject({
  t: z.literal("moderate"),
  requestId: RequestIdSchema,
  action: ModerateActionSchema,
});

// §4.2 : les pixels d'un auteur (sa preuve s'il est banni), et la liste des bannis.
const ListPixelsFrameSchema = z.strictObject({
  t: z.literal("listPixels"),
  requestId: RequestIdSchema,
  userId: UserIdSchema,
});

const ListBansFrameSchema = z.strictObject({ t: z.literal("listBans"), requestId: RequestIdSchema });

// §4.2 : les modérateurs du canvas, et d'où ils viennent.
const ListModeratorsFrameSchema = z.strictObject({
  t: z.literal("listModerators"),
  requestId: RequestIdSchema,
});

// JOURNAL 2026-09-27 : le streamer nomme ou retire un modérateur ici. Répond par `moderators`.
const SetModeratorFrameSchema = z.strictObject({
  t: z.literal("setModerator"),
  requestId: RequestIdSchema,
  userId: UserIdSchema,
  isModerator: z.boolean(),
});

// CDC 2026 §1 : le streamer règle le délai de sa vue OBS, un cran à la fois.
const ObsDelaySchema = z.number().int().refine(isObsDelayStep, "pas un cran du délai OBS");

const SetObsDelayFrameSchema = z.strictObject({
  t: z.literal("setObsDelay"),
  requestId: RequestIdSchema,
  obsDelayMs: ObsDelaySchema,
});

// §4.2 : la pose de la case, vérifiée par le serveur au moment du signalement.
// §4.2 : `range` étend le signalement aux poses voisines de l'auteur.
const ReportFrameSchema = z.strictObject({
  t: z.literal("report"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  placementId: PlacementIdSchema,
  range: RangeSchema.optional(),
});

// §4.2 : les pixels de l'auteur de la pose en (x, y), pour choisir la plage à signaler.
const ListAuthorPixelsFrameSchema = z.strictObject({
  t: z.literal("listAuthorPixels"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  placementId: PlacementIdSchema,
});

const ListReportsFrameSchema = z.strictObject({ t: z.literal("listReports"), requestId: RequestIdSchema });

// §4.2 : le streamer seul, et seulement une taille du CDC 2026 §1.
const ResizeCanvasFrameSchema = z
  .strictObject({
    t: z.literal("resizeCanvas"),
    requestId: RequestIdSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .refine(isCanvasSize, "pas une taille du cahier des charges");

// CDC 2026 §1 : le streamer seul, pris aussitôt par les sources ouvertes, comme le délai.
const SetObsBackgroundFrameSchema = z.strictObject({
  t: z.literal("setObsBackground"),
  requestId: RequestIdSchema,
  obsBackground: z.enum(OBS_BACKGROUNDS),
});

// JOURNAL 2026-09-30 : un +1 de jauge max, répondu par un `ack` (`accepted` vaut 1 ou 0).
const ClaimGaugeFrameSchema = z.strictObject({ t: z.literal("claimGauge"), requestId: RequestIdSchema });

const GaugeLimitsSchema = z.strictObject({
  gaugeMaxStart: z.number().int(),
  gaugeMaxCeiling: z.number().int(),
});

// JOURNAL 2026-09-30 : le streamer seul, pris aussitôt par chaque page, comme le délai.
const SetGaugeLimitsFrameSchema = GaugeLimitsSchema.extend({
  t: z.literal("setGaugeLimits"),
  requestId: RequestIdSchema,
}).refine(isGaugeLimits, "hors des bornes de la jauge");

// Écart §4.2 (JOURNAL 2026-10-06) : le développeur seul ; venues d'une autre session, le gateway les ignore.
const WatchActivityFrameSchema = z.strictObject({ t: z.literal("watchActivity"), isWatching: z.boolean() });

const ListActivityHistoryFrameSchema = z.strictObject({
  t: z.literal("listActivityHistory"),
  requestId: RequestIdSchema,
  period: z.enum(ACTIVITY_PERIODS),
});

// Écart §4.2 (JOURNAL 2026-10-07) : la capacité, comme l'activité, pour le développeur seul.
const WatchCapacityFrameSchema = z.strictObject({ t: z.literal("watchCapacity"), isWatching: z.boolean() });

const ListCapacityHistoryFrameSchema = z.strictObject({
  t: z.literal("listCapacityHistory"),
  requestId: RequestIdSchema,
  period: z.enum(ACTIVITY_PERIODS),
});

const PingFrameSchema = z.strictObject({ t: z.literal("ping") });

const ClientFrameSchema = z.discriminatedUnion("t", [
  HelloFrameSchema,
  PlaceFrameSchema,
  InspectFrameSchema,
  ModerateFrameSchema,
  ListPixelsFrameSchema,
  ListBansFrameSchema,
  ListModeratorsFrameSchema,
  SetModeratorFrameSchema,
  SetObsDelayFrameSchema,
  ReportFrameSchema,
  ListAuthorPixelsFrameSchema,
  ListReportsFrameSchema,
  ResizeCanvasFrameSchema,
  SetObsBackgroundFrameSchema,
  ClaimGaugeFrameSchema,
  SetGaugeLimitsFrameSchema,
  WatchActivityFrameSchema,
  ListActivityHistoryFrameSchema,
  WatchCapacityFrameSchema,
  ListCapacityHistoryFrameSchema,
  PingFrameSchema,
]);

export type ClientFrame = z.infer<typeof ClientFrameSchema>;

// --- Frames serveur → client (§4.3) -------------------------------------
// Le snapshot est hors bande : une frame binaire (width × height octets),
// jamais un objet `t`-discriminé, donc pas de schéma Zod ici.

// Écart §4.3 (JOURNAL 2026-10-07) : borné par caractères comme `toTheme` ; `.max` compterait les unités UTF-16, et un
// thème de 40 émojis serait refusé.
const ThemeSchema = z
  .string()
  .min(1)
  .refine((theme) => Array.from(theme).length <= THEME_MAX_LENGTH, "thème trop long");

const WelcomeFrameSchema = z.object({
  t: z.literal("welcome"),
  canvas: z.object({
    canvasId: CanvasIdSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    ownerId: UserIdSchema,
    archivedAt: TimestampSchema.optional(), // Écart §15 (JOURNAL 2026-10-06) : présent, le canvas est une archive
    ownerTwitchLive: TwitchLiveSchema.optional(), // Écart §4.3 (JOURNAL 2026-10-07) : le streamer est en live
  }),
  params: z.object({
    gaugeMaxStart: z.number().int().positive(), // JOURNAL 2026-09-30 : la jauge max du joueur vient de `gauge`
    gaugeMaxCeiling: z.number().int().positive(),
    refillMs: z.number().int().positive(),
    refillCharges: z.number().int().positive(),
    obsDelayMs: z.number().int().nonnegative(),
    obsBackground: z.enum(OBS_BACKGROUNDS), // JOURNAL 2026-09-29
    theme: ThemeSchema.optional(), // Écart §4.3 (JOURNAL 2026-10-07) : absent, le canvas n'a pas de thème
  }),
  palette: z.array(z.string()),
  version: VersionSchema,
  you: z.object({
    userId: UserIdSchema.optional(),
    login: TwitchLoginSchema.optional(),
    displayName: DisplayNameSchema.optional(),
    avatarUrl: z.string().optional(), // §4.3 : un ancien client l'ignore
    twitchLive: TwitchLiveSchema.optional(), // Écart §4.3 (JOURNAL 2026-10-07) : la personne connectée est en live
    role: RoleSchema,
  }),
  gauge: GaugeSchema.optional(),
  recent: CellsPayloadSchema.optional(),
});

const CellsFrameSchema = CellsPayloadSchema.extend({ t: z.literal("cells") });

const AckFrameSchema = z.object({
  t: z.literal("ack"),
  requestId: RequestIdSchema,
  version: VersionSchema.optional(),
  accepted: z.number().int().nonnegative(),
  rejected: z.array(RejectedPixelSchema),
  gauge: GaugeSchema,
});

const InspectedFrameSchema = z.object({
  t: z.literal("inspected"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  entry: InspectEntrySchema.optional(),
});

const GaugeFrameSchema = GaugeSchema.extend({ t: z.literal("gauge") });

const ModeratedFrameSchema = z.object({
  t: z.literal("moderated"),
  requestId: RequestIdSchema,
  version: VersionSchema,
  cells: z.number().int().nonnegative(),
  done: z.boolean(),
});

const BannedFrameSchema = z.object({ t: z.literal("banned") });

// §4.3 : l'heure et la pose de chaque pixel, absentes de la preuve d'un ban.
const AuthoredPixelSchema = PixelSchema.extend({
  placedAt: TimestampSchema.optional(),
  placementId: PlacementIdSchema.optional(),
});

// §4.3 : la réponse à `listAuthorPixels`, sans l'identifiant de l'auteur.
const AuthorPixelsFrameSchema = z.object({
  t: z.literal("authorPixels"),
  requestId: RequestIdSchema,
  pixels: z.array(AuthoredPixelSchema),
});

// §4.3 : la réponse à `listPixels` et à `listBans`, et le débannissement en direct.
const PixelsFrameSchema = z.object({
  t: z.literal("pixels"),
  requestId: RequestIdSchema,
  userId: UserIdSchema,
  pixels: z.array(AuthoredPixelSchema),
});

const BannedUserSchema = z.object({
  userId: UserIdSchema,
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
  pixelCount: z.number().int().nonnegative(),
  isFromTwitch: z.boolean(), // §4.3 : un déban Twitch le lèverait
  hasAccount: z.boolean(), // sans compte LivePlace : son nom vient de Twitch
});

const BansFrameSchema = z.object({
  t: z.literal("bans"),
  requestId: RequestIdSchema,
  users: z.array(BannedUserSchema),
});

const UnbannedFrameSchema = z.object({ t: z.literal("unbanned") });

// §4.3 : un modérateur, nommé sur Twitch, ici, ou les deux.
const ModeratorSchema = z.object({
  userId: UserIdSchema,
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
  isFromTwitch: z.boolean(),
  isNamedHere: z.boolean(),
  hasAccount: z.boolean(),
});

// La synchro Twitch du canvas : faite, ou à refaire (droits retirés chez Twitch). Absente : jamais faite.
const TwitchSyncSchema = z.object({ status: z.enum(["ok", "revoked"]), syncedAt: TimestampSchema });

const ModeratorsFrameSchema = z.object({
  t: z.literal("moderators"),
  requestId: RequestIdSchema,
  users: z.array(ModeratorSchema),
  twitchSync: TwitchSyncSchema.optional(),
});

// §4.3 : une pose signalée, en attente d'un modérateur, avec ses pixels visibles.
const ReportedPlacementSchema = z.object({
  userId: UserIdSchema,
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
  hasAccount: z.boolean(),
  moderatorOrigin: ModeratorOriginSchema.optional(), // Écart §4.3 (JOURNAL 2026-10-08) : un modérateur nommé ici ne se bannit pas
  placementId: PlacementIdSchema,
  reportCount: z.number().int().positive(),
  reportedAt: TimestampSchema, // le premier signalement
  isOffStream: z.boolean(), // cachée du stream : le seuil est atteint
  pixels: z.array(PixelSchema),
});

const ReportedFrameSchema = z.object({ t: z.literal("reported"), requestId: RequestIdSchema });

// La nouvelle taille arrive ensuite par un `welcome` et un snapshot, à toutes les pages du canvas (JOURNAL 2026-09-29).
const ResizedFrameSchema = z.object({ t: z.literal("resized"), requestId: RequestIdSchema });

const ReportsFrameSchema = z.object({
  t: z.literal("reports"),
  requestId: RequestIdSchema,
  reports: z.array(ReportedPlacementSchema),
});

// Pour qui modère : à l'arrivée, puis à chaque signalement ou décision.
const ReportCountFrameSchema = z.object({
  t: z.literal("reportCount"),
  count: z.number().int().nonnegative(),
});

// §10.3 : ses droits ont changé pendant la session.
const RoleFrameSchema = z.object({ t: z.literal("role"), role: RoleSchema });

// Écart §4.3 (JOURNAL 2026-10-06) : pour qui modère, la liste des bannis ou celle des modérateurs a bougé, la page la relit.
const StaleListFrameSchema = z.object({ t: z.literal("staleList"), list: z.enum(["bans", "moderators"]) });

// Écart §4.3 (JOURNAL 2026-10-06) : une ligne du classement, sans identifiant ; `you.rank` désigne la ligne du top.
const ScoreboardEntrySchema = z.object({
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
  pixels: z.number().int().positive(),
});

// La place de qui regarde : absente pour un invité, un banni, ou qui n'a rien posé.
const ScoreboardRankSchema = z.object({
  rank: z.number().int().positive(),
  pixels: z.number().int().positive(),
});

const ScoreboardFrameSchema = z.object({
  t: z.literal("scoreboard"),
  top: z.array(ScoreboardEntrySchema).max(SCOREBOARD_SIZE),
  you: ScoreboardRankSchema.optional(),
});

// Le délai vient de changer : toutes les pages du canvas le prennent aussitôt (JOURNAL 2026-09-25).
const ObsDelayFrameSchema = z.object({ t: z.literal("obsDelay"), obsDelayMs: ObsDelaySchema });

// Le fond vient de changer : toutes les pages du canvas le prennent aussitôt (JOURNAL 2026-09-29).
const ObsBackgroundFrameSchema = z.object({
  t: z.literal("obsBackground"),
  obsBackground: z.enum(OBS_BACKGROUNDS),
});

// Le thème vient de changer : toutes les pages du canvas le prennent aussitôt ; sans `theme`, il n'y en a plus
// (Écart §4.3, JOURNAL 2026-10-07).
const ThemeFrameSchema = z.object({ t: z.literal("theme"), theme: ThemeSchema.optional() });

// Les bornes viennent de changer : chaque page les prend, et reçoit ensuite sa jauge (JOURNAL 2026-09-30).
const GaugeLimitsFrameSchema = z.object({
  t: z.literal("gaugeLimits"),
  gaugeMaxStart: z.number().int().positive(),
  gaugeMaxCeiling: z.number().int().positive(),
});

// Écart §15 (JOURNAL 2026-10-06), à toutes les pages du canvas : archivé, la page du jeu et la vue OBS relisent le canvas
// actif ; redevenu actif, une page d'archive part sur `/{login}` ; supprimé, elle montre l'introuvable.
const CanvasStatusFrameSchema = z.object({ t: z.literal("canvasStatus"), status: z.enum(CANVAS_STATUSES) });

// Écart §4.3 (JOURNAL 2026-10-07) : le live du streamer de la page ou de la personne connectée vient de changer.
// `twitchLive` absent : plus en live.
const TwitchLiveFrameSchema = z.object({
  t: z.literal("twitchLive"),
  userId: UserIdSchema,
  twitchLive: TwitchLiveSchema.optional(),
});

// Écart §4.3 (JOURNAL 2026-10-06) : le suivi d'activité, pour le développeur seul.
const CountSchema = z.number().int().nonnegative();

// Ce que l'historique garde, et ce que disent les chiffres de l'instant : des nombres, aucun nom (écart §5.1, JOURNAL 2026-10-06).
const ActivityCountsSchema = z.object({
  people: CountSchema,
  streamed: CountSchema, // les canvas streamés : une vue OBS ouverte et le streamer en live (Écart §5.1, JOURNAL 2026-10-08)
  pixels: CountSchema,
  signups: CountSchema,
});

// Un compte vu par le suivi : sa session, ou le miroir `user:` pour le streamer d'un canvas.
const ActivityUserSchema = z.object({
  userId: UserIdSchema,
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
});

// Depuis sa plus ancienne page ouverte sur ce canvas, et les appareils de ses pages.
const ConnectedAccountSchema = ActivityUserSchema.extend({
  role: RoleSchema,
  connectedAt: TimestampSchema,
  devices: z.array(z.enum(DEVICES)),
});

// `isStreamed` : une vue OBS est ouverte et son streamer est en live, l'état de l'instant sans la tolérance de l'historique
// (Écart §5.1, JOURNAL 2026-10-08) ; `obsViews`, ses vues OBS ouvertes, n'en est qu'un détail. `heat` : ses pixels de la dernière
// heure. Le streamer porte son live Twitch quand il en a un (Écart §4.3, JOURNAL 2026-10-07) ; les comptes connectés, eux, n'en
// portent pas.
const ActivityCanvasSchema = z.object({
  canvasId: CanvasIdSchema,
  owner: ActivityUserSchema.extend({ twitchLive: TwitchLiveSchema.optional() }),
  isStreamed: z.boolean(),
  obsViews: CountSchema,
  people: CountSchema,
  guests: CountSchema,
  heat: CountSchema,
  signups: CountSchema, // les nouveaux comptes du jour venus de sa page
  accounts: z.array(ConnectedAccountSchema),
});

// L'audience d'une période (JOURNAL 2026-10-07) : les visites dont celles au téléphone, le temps passé en minutes, et les
// comptes, joueurs et streamers distincts.
const AudienceCountsSchema = z.object({
  visits: CountSchema,
  phoneVisits: CountSchema,
  visitMinutes: CountSchema,
  activeAccounts: CountSchema,
  activePlayers: CountSchema,
  activeStreamers: CountSchema,
});

// L'audience d'un canvas (JOURNAL 2026-10-07) : celle de tout LivePlace sans les comptes ni les streamers actifs, avec
// ses joueurs actifs et les nouveaux comptes venus de sa page.
const CanvasAudienceCountsSchema = z.object({
  visits: CountSchema,
  phoneVisits: CountSchema,
  visitMinutes: CountSchema,
  activePlayers: CountSchema,
  signups: CountSchema,
});

// Le canvas de la socket du développeur (JOURNAL 2026-10-07) : un canvas de la liste, sans les nouveaux comptes du jour
// (l'audience a les siens), avec ses pixels de la dernière minute, glissante, et son audience.
const ActivityHereSchema = ActivityCanvasSchema.omit({ signups: true }).extend({
  pixels: CountSchema,
  audience: z.object({ today: CanvasAudienceCountsSchema, month: CanvasAudienceCountsSchema }),
});

// `pixels` : la dernière minute, glissante ; `signups` : le jour de Paris. L'audience : le jour de Paris et les 30 jours.
// Les canvas, du plus chaud au plus froid. `here` : absent quand la socket n'a pas de canvas prêt, ou pour un gateway d'avant.
const ActivityFrameSchema = z.object({
  t: z.literal("activity"),
  now: ActivityCountsSchema.extend({ guests: CountSchema }),
  audience: z.object({ today: AudienceCountsSchema, month: AudienceCountsSchema }),
  canvases: z.array(ActivityCanvasSchema),
  here: ActivityHereSchema.optional(),
});

// Un point, à `at` son début : le pic des personnes et des canvas streamés, la somme des pixels, des comptes, des visites et du
// temps passé. Un point d'avant l'audience se lit à zéro ; les distincts ne se gardent que par jour.
const ActivityPointSchema = ActivityCountsSchema.extend({
  at: TimestampSchema,
  visits: CountSchema.default(0),
  phoneVisits: CountSchema.default(0),
  visitMinutes: CountSchema.default(0),
  activeAccounts: CountSchema.optional(),
  activePlayers: CountSchema.optional(),
  activeStreamers: CountSchema.optional(),
});

// Un point d'un canvas (JOURNAL 2026-10-07), à `at` son début : le pic des personnes, la somme des pixels, des visites, du
// temps passé, des minutes streamées (0 ou 1 à la minute, JOURNAL 2026-10-08) et des nouveaux comptes venus de sa page. Les
// joueurs actifs ne se gardent que par jour.
const CanvasPointSchema = z.object({
  at: TimestampSchema,
  people: CountSchema,
  streamedMinutes: CountSchema,
  pixels: CountSchema,
  visits: CountSchema,
  visitMinutes: CountSchema,
  signups: CountSchema,
  activePlayers: CountSchema.optional(),
});

// `canvasPoints` : ceux du canvas de la socket, sur la même période ; un point absent vaut zéro. Absent : un gateway d'avant.
const ActivityHistoryFrameSchema = z.object({
  t: z.literal("activityHistory"),
  requestId: RequestIdSchema,
  points: z.array(ActivityPointSchema),
  canvasPoints: z.array(CanvasPointSchema).optional(),
});

// Écart §4.3 (JOURNAL 2026-10-07) : la capacité, pour le développeur seul. Un taux est un pourcentage de son plafond.
const RatioSchema = z.number().nonnegative();
const CapacityResourceIdSchema = z.enum(CAPACITY_RESOURCE_IDS);

// Une ressource : mesurée, elle dit sa valeur, son plafond et son taux (et le jour où un quota mensuel serait plein) ;
// sans nouvelles ou non mesurée, rien de tout cela. Convex dit les déploiements qu'il compte, par leur nom.
const CapacityResourceBaseSchema = z.object({
  link: z.enum(CAPACITY_LINKS),
  id: CapacityResourceIdSchema,
  unit: z.enum(CAPACITY_UNITS),
  deployments: z.array(z.string()).optional(),
});

const CapacityResourceSchema = z.discriminatedUnion("state", [
  CapacityResourceBaseSchema.extend({
    state: z.literal("measured"),
    value: z.number().nonnegative(),
    ceiling: z.number().positive(),
    ratio: RatioSchema,
    fullAt: TimestampSchema.optional(),
  }),
  CapacityResourceBaseSchema.extend({ state: z.literal("withoutNews") }),
  CapacityResourceBaseSchema.extend({ state: z.literal("unmeasured") }),
]);

// `resource` : celle qui porte la saturation, absente quand rien n'est mesuré. `isIncomplete` : une ressource est sans nouvelles.
const CapacityFrameSchema = z.object({
  t: z.literal("capacity"),
  saturation: z.object({
    percent: RatioSchema,
    resource: CapacityResourceIdSchema.optional(),
    isIncomplete: z.boolean(),
  }),
  resources: z.array(CapacityResourceSchema),
});

// Un point, à `at` son début : le pic de la saturation et de la ressource qui la portait, et le plus haut taux de chaque
// maillon. Un maillon sans mesure à ce moment-là n'a pas de taux : la courbe laisse un trou.
const CapacityPointSchema = z.object({
  at: TimestampSchema,
  saturation: RatioSchema,
  resource: CapacityResourceIdSchema.optional(),
  redis: RatioSchema.optional(),
  gateway: RatioSchema.optional(),
  web: RatioSchema.optional(),
  machine: RatioSchema.optional(),
  convex: RatioSchema.optional(),
});

const CapacityHistoryFrameSchema = z.object({
  t: z.literal("capacityHistory"),
  requestId: RequestIdSchema,
  points: z.array(CapacityPointSchema),
});

const ErrorFrameSchema = z.object({
  t: z.literal("error"),
  code: ErrorCodeSchema,
  requestId: RequestIdSchema.optional(), // §4.3 : le refus d'une seule requête
  message: z.string().optional(),
});

const PongFrameSchema = z.object({ t: z.literal("pong") });

const ServerFrameSchema = z.discriminatedUnion("t", [
  WelcomeFrameSchema,
  CellsFrameSchema,
  AckFrameSchema,
  InspectedFrameSchema,
  GaugeFrameSchema,
  ModeratedFrameSchema,
  BannedFrameSchema,
  PixelsFrameSchema,
  BansFrameSchema,
  ModeratorsFrameSchema,
  UnbannedFrameSchema,
  RoleFrameSchema,
  ObsDelayFrameSchema,
  ObsBackgroundFrameSchema,
  ThemeFrameSchema,
  GaugeLimitsFrameSchema,
  ReportedFrameSchema,
  ResizedFrameSchema,
  AuthorPixelsFrameSchema,
  ReportsFrameSchema,
  ReportCountFrameSchema,
  StaleListFrameSchema,
  ScoreboardFrameSchema,
  CanvasStatusFrameSchema,
  TwitchLiveFrameSchema,
  ActivityFrameSchema,
  ActivityHistoryFrameSchema,
  CapacityFrameSchema,
  CapacityHistoryFrameSchema,
  ErrorFrameSchema,
  PongFrameSchema,
]);

export type ServerFrame = z.infer<typeof ServerFrameSchema>;

// --- Codecs ----------------------------------------------------------------

export function decodeClientFrame(raw: unknown): Result<ClientFrame> {
  const parsed = ClientFrameSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}

export function decodeServerFrame(raw: unknown): Result<ServerFrame> {
  const parsed = ServerFrameSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}
