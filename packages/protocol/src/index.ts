// Frames client ↔ serveur, schémas Zod, version du protocole (§4).

import { isObsDelayStep, ROLES, type Timestamp } from "@liveplace/domain";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

// --- Constantes et types de base --------------------------------------

// 2 : cinq frames de modération, `cursor` et `clearArea` retirés. 3 : le délai OBS à chaud (JOURNAL 2026-09-25).
// 4 : l'identifiant de l'auteur inspecté devient optionnel, et une `error` peut nommer sa requête (JOURNAL 2026-09-27).
// 5 : le rôle se relit en direct (frame `role`), et les modérateurs se listent (JOURNAL 2026-09-27).
// 6 : la pose, le signalement et la case vue par le stream (JOURNAL 2026-09-28).
// 7 : signaler une plage d'heures, et les pixels de l'auteur d'une pose pour la choisir (JOURNAL 2026-09-29).
export const PROTOCOL_VERSION = 7;

// --- Types internes (§4.4) — jamais envoyés tels quels au client -------
// Event vit dans le Redis Stream et dans l'archive Convex. CellsFrame est
// la seule forme que le client connaît : le worker/gateway traduit l'un
// vers l'autre, sans jamais laisser `authorId` ni `moderation` franchir le fil.

// Écart §4.3 (JOURNAL 2026-09-28) : `hide` et `unhide` ne changent que ce que montre le stream.
export type EventKind = "place" | "clear" | "hide" | "unhide";

export type Event = {
  version: number;
  kind: EventKind;
  authorId: string | null; // null = système
  occurredAt: Timestamp;
  cells: EventCell[];
  // Écart §4.4 (JOURNAL 2026-09-25) : plus de `clearArea`, donc plus d'`area`.
  moderation?: {
    action: ModerateAction["action"];
    target: string;
    placementId?: string; // `clearPlacement` et `approvePlacement` (JOURNAL 2026-09-28)
  };
};

// Écart §9.5 (JOURNAL 2026-09-28) : la case vue par le stream, quand une pose cachée est en jeu.
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
// Écart §5.1 (JOURNAL 2026-09-28) : tirée par la page, elle commence par une lettre ; un pixel plus ancien a sa version.
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

const InspectEntrySchema = z.object({
  userId: UserIdSchema.optional(), // Écart §4.3 (JOURNAL 2026-09-27) : seulement pour qui modère
  moderatorOrigin: ModeratorOriginSchema.optional(), // pour le seul streamer, quand l'auteur est modérateur
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(), // Écart §4.3 (JOURNAL 2026-09-24) : un ancien client l'ignore
  colorIndex: ColorIndexSchema,
  placedAt: TimestampSchema,
  placementId: PlacementIdSchema, // Écart §4.3 (JOURNAL 2026-09-28) : la pose, pour la signaler ou la retirer
  canReport: z.boolean().optional(), // absent : ne peut pas la signaler
});

const ErrorCodeSchema = z.enum([
  "protocol_version",
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "invalid_frame",
  "canvas_not_found",
  "server_full",
]);

// --- Frames client → serveur (§4.2) -------------------------------------

const HelloFrameSchema = z.object({
  t: z.literal("hello"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  canvasId: CanvasIdSchema,
  mode: z.enum(["ui", "obs"]),
  lastVersion: VersionSchema.optional(),
});

const PlaceFrameSchema = z.object({
  t: z.literal("place"),
  requestId: RequestIdSchema,
  placementId: ClientPlacementIdSchema, // le même pour chaque lot d'un brouillon validé (JOURNAL 2026-09-28)
  pixels: z.array(PixelSchema).min(1).max(64),
});

const InspectFrameSchema = z.object({
  t: z.literal("inspect"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
});

// Écart §5.4 (JOURNAL 2026-09-28) : les autres pixels de l'auteur posés entre `from` et `to`, autour d'une pose.
const RangeSchema = z
  .object({ from: TimestampSchema, to: TimestampSchema })
  .refine(({ from, to }) => from <= to, "plage à l'envers");

// Écart §5.4 et §4.2 (JOURNAL 2026-09-25) : pas de `cursor`, le gateway enchaîne les tranches ; plus de `clearArea`.
const ModerateActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["clearUser", "ban", "unban"]), target: UserIdSchema }),
  z.object({
    action: z.literal("clearPlacement"),
    target: UserIdSchema,
    placementId: PlacementIdSchema,
    range: RangeSchema.optional(),
  }),
  z.object({ action: z.literal("approvePlacement"), target: UserIdSchema, placementId: PlacementIdSchema }),
]);

export type ModerateAction = z.infer<typeof ModerateActionSchema>;

const ModerateFrameSchema = z.object({
  t: z.literal("moderate"),
  requestId: RequestIdSchema,
  action: ModerateActionSchema,
});

// Écart §4.2 (JOURNAL 2026-09-25) : les pixels d'un auteur (sa preuve s'il est banni), et la liste des bannis.
const ListPixelsFrameSchema = z.object({
  t: z.literal("listPixels"),
  requestId: RequestIdSchema,
  userId: UserIdSchema,
});

const ListBansFrameSchema = z.object({ t: z.literal("listBans"), requestId: RequestIdSchema });

// Écart §4.2 (JOURNAL 2026-09-27) : les modérateurs du canvas, et d'où ils viennent.
const ListModeratorsFrameSchema = z.object({ t: z.literal("listModerators"), requestId: RequestIdSchema });

// JOURNAL 2026-09-27 : le streamer nomme ou retire un modérateur ici. Répond par `moderators`.
const SetModeratorFrameSchema = z.object({
  t: z.literal("setModerator"),
  requestId: RequestIdSchema,
  userId: UserIdSchema,
  isModerator: z.boolean(),
});

// Écart CDC v3 §1 (JOURNAL 2026-09-25) : le streamer règle le délai de sa vue OBS, un cran à la fois.
const ObsDelaySchema = z.number().int().refine(isObsDelayStep, "pas un cran du délai OBS");

const SetObsDelayFrameSchema = z.object({
  t: z.literal("setObsDelay"),
  requestId: RequestIdSchema,
  obsDelayMs: ObsDelaySchema,
});

// Écart §4.2 (JOURNAL 2026-09-28) : la pose de la case, vérifiée par le serveur au moment du signalement.
// Écart §4.2 (JOURNAL 2026-09-29) : `range` étend le signalement aux poses voisines de l'auteur.
const ReportFrameSchema = z.object({
  t: z.literal("report"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  placementId: PlacementIdSchema,
  range: RangeSchema.optional(),
});

// Écart §4.2 (JOURNAL 2026-09-29) : les pixels de l'auteur de la pose en (x, y), pour choisir la plage à signaler.
const ListAuthorPixelsFrameSchema = z.object({
  t: z.literal("listAuthorPixels"),
  requestId: RequestIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  placementId: PlacementIdSchema,
});

const ListReportsFrameSchema = z.object({ t: z.literal("listReports"), requestId: RequestIdSchema });

const PingFrameSchema = z.object({ t: z.literal("ping") });

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
  PingFrameSchema,
]);

export type ClientFrame = z.infer<typeof ClientFrameSchema>;

// --- Frames serveur → client (§4.3) -------------------------------------
// Le snapshot est hors bande : une frame binaire (width × height octets),
// jamais un objet `t`-discriminé, donc pas de schéma Zod ici.

const WelcomeFrameSchema = z.object({
  t: z.literal("welcome"),
  canvas: z.object({
    canvasId: CanvasIdSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    ownerId: UserIdSchema,
  }),
  params: z.object({
    gaugeMax: z.number().int().nonnegative(),
    refillMs: z.number().int().positive(),
    refillCharges: z.number().int().positive(),
    obsDelayMs: z.number().int().nonnegative(),
  }),
  palette: z.array(z.string()),
  version: VersionSchema,
  you: z.object({
    userId: UserIdSchema.optional(),
    login: TwitchLoginSchema.optional(),
    displayName: DisplayNameSchema.optional(),
    avatarUrl: z.string().optional(), // Écart §4.3 (JOURNAL 2026-09-24) : un ancien client l'ignore
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

// Écart §4.3 (JOURNAL 2026-09-28) : l'heure et la pose de chaque pixel, absentes de la preuve d'un ban.
const AuthoredPixelSchema = PixelSchema.extend({
  placedAt: TimestampSchema.optional(),
  placementId: PlacementIdSchema.optional(),
});

// Écart §4.3 (JOURNAL 2026-09-29) : la réponse à `listAuthorPixels`, sans l'identifiant de l'auteur.
const AuthorPixelsFrameSchema = z.object({
  t: z.literal("authorPixels"),
  requestId: RequestIdSchema,
  pixels: z.array(AuthoredPixelSchema),
});

// Écart §4.3 (JOURNAL 2026-09-25) : la réponse à `listPixels` et à `listBans`, et le débannissement en direct.
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
  isFromTwitch: z.boolean(), // Écart §4.3 (JOURNAL 2026-09-27) : un déban Twitch le lèverait
  hasAccount: z.boolean(), // sans compte LivePlace : son nom vient de Twitch
});

const BansFrameSchema = z.object({
  t: z.literal("bans"),
  requestId: RequestIdSchema,
  users: z.array(BannedUserSchema),
});

const UnbannedFrameSchema = z.object({ t: z.literal("unbanned") });

// Écart §4.3 (JOURNAL 2026-09-27) : un modérateur, nommé sur Twitch, ici, ou les deux.
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

// Écart §4.3 (JOURNAL 2026-09-28) : une pose signalée, en attente d'un modérateur, avec ses pixels visibles.
const ReportedPlacementSchema = z.object({
  userId: UserIdSchema,
  login: TwitchLoginSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().optional(),
  hasAccount: z.boolean(),
  placementId: PlacementIdSchema,
  reportCount: z.number().int().positive(),
  reportedAt: TimestampSchema, // le premier signalement
  isOffStream: z.boolean(), // cachée du stream : le seuil est atteint
  pixels: z.array(PixelSchema),
});

const ReportedFrameSchema = z.object({ t: z.literal("reported"), requestId: RequestIdSchema });

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

// Écart §10.3 (JOURNAL 2026-09-27) : ses droits ont changé pendant la session.
const RoleFrameSchema = z.object({ t: z.literal("role"), role: RoleSchema });

// Le délai vient de changer : toutes les pages du canvas le prennent aussitôt (JOURNAL 2026-09-25).
const ObsDelayFrameSchema = z.object({ t: z.literal("obsDelay"), obsDelayMs: ObsDelaySchema });

const ErrorFrameSchema = z.object({
  t: z.literal("error"),
  code: ErrorCodeSchema,
  requestId: RequestIdSchema.optional(), // Écart §4.3 (JOURNAL 2026-09-27) : le refus d'une seule requête
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
  ReportedFrameSchema,
  AuthorPixelsFrameSchema,
  ReportsFrameSchema,
  ReportCountFrameSchema,
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
