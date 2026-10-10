// L'état local d'un canvas : la copie de `state`, sa version, la jauge, et le rôle et le nom donnés par le gateway (§9.2).

import {
  type ActivityPeriod,
  type CanvasStatus,
  type GaugeLimits,
  type ObsBackground,
  type Role,
  type Timestamp,
  TRANSPARENT_COLOR_INDEX,
  toStateOffset,
} from "@liveplace/domain";
import type {
  AckFrame,
  ActivityFrame,
  ActivityHistory,
  AuthoredPixel,
  BannedUser,
  CapacityFrame,
  CapacityHistory,
  InspectEntry,
  Moderation,
  Moderator,
  Placement,
  PlacementRange,
  ReportedPlacement,
  Transport,
  TwitchLive,
  TwitchSync,
} from "@liveplace/domain/ports";
import {
  type BroadcastCell,
  type CellsFrame,
  type ClientFrame,
  PROTOCOL_VERSION,
  type ServerFrame,
} from "@liveplace/protocol";
import type { Result } from "@liveplace/shared";

type ErrorCode = Extract<ServerFrame, { t: "error" }>["code"];
type WelcomeFrame = Extract<ServerFrame, { t: "welcome" }>;
type PlaceFrame = Extract<ClientFrame, { t: "place" }>;

// L'ack d'un lot reste gardé 120 s par place.lua : au-delà, le renvoyer le poserait deux fois (JOURNAL 2026-09-25).
const RESEND_MAX_AGE_MS = 100_000;

// `obs` : la page ouverte dans OBS (§9.1). Le gateway y joint le `recent` au snapshot (§9.5).
export type CanvasMode = "ui" | "obs";

export type CanvasStoreOptions = {
  mode: CanvasMode;
  now: () => Timestamp; // l'âge d'un lot au moment de le renvoyer
  reload: () => void; // §4.5 : une reprise refusée pour la version du protocole
  // Écart §4.2 (JOURNAL 2026-10-09) : le web dit si rien ne ramènera un canvas que le gateway ne trouve pas. Absent, le
  // store croit le gateway ; sinon la page attend cette réponse avant de dire « introuvable » (vue OBS exceptée).
  isMissingConfirmed?: (canvasId: string) => Promise<boolean>;
};

// Ce qui arrive du serveur, dans l'ordre : la vue OBS en tient son propre affichage (§9.5).
export type Arrival =
  | { kind: "snapshot"; pixels: Uint8Array; recent: CellsFrame | null }
  | { kind: "cells"; frame: CellsFrame };

export type Pixel = Placement["pixels"][number];
// Une case de sa pose que le serveur a acceptée, avec la couleur qu'elle remplace.
export type ConfirmedPixel = Pixel & { previousColorIndex: number };
export type ServerGauge = AckFrame["gauge"];
// `closed` : la connexion est tombée avant l'ack.
export type PlaceResult = Result<AckFrame, ErrorCode | "closed">;
// Les modérateurs, et l'état de la synchro Twitch quand elle a été faite (JOURNAL 2026-09-27).
export type ModeratorList = { users: Moderator[]; twitchSync?: TwitchSync };
export type StaleList = Extract<ServerFrame, { t: "staleList" }>["list"];
// Écart §4.3 (JOURNAL 2026-10-06) : le top du classement et la place de cette page.
export type Scoreboard = Omit<Extract<ServerFrame, { t: "scoreboard" }>, "t">;

// Une requête de modération ou de lecture (JOURNAL 2026-09-25), réglée par la réponse de son `requestId`.
export type RequestResult<T> = Result<T, ErrorCode | "closed">;
export type ModerationAction = Moderation["action"];

// La case inspectée (CDC 2026) : en attente de la réponse, avec son auteur, ou jamais posée.
export type Inspection =
  | { status: "loading"; x: number; y: number }
  | { status: "found"; x: number; y: number; entry: InspectEntry }
  | { status: "empty"; x: number; y: number };

export type CanvasView = {
  status: "connecting" | "live" | "reconnecting" | "closed"; // `closed` : pour de bon
  width: number;
  height: number;
  palette: readonly string[];
  version: number;
  role?: Role;
  ownerId?: string; // le streamer : jamais modéré sur son canvas (JOURNAL 2026-09-25)
  isBanned: boolean; // lecture seule (§10.2), mis par `banned`, retiré par `unbanned`
  // Écart §15 (JOURNAL 2026-10-06) : le canvas est une archive, lecture seule pour tous. Le `welcome` le dit, la frame
  // `canvasStatus` le change, et une écriture refusée par `canvas_archived` l'apprend. `isDiscarded` : il a été supprimé.
  isArchived: boolean;
  isDiscarded: boolean;
  userId?: string; // absent pour un invité
  login?: string; // absent pour un invité
  displayName?: string; // absent pour un invité
  avatarUrl?: string; // absente pour un invité, ou d'une session d'avant la photo (JOURNAL 2026-09-24)
  // Écart §4 (JOURNAL 2026-10-07) : le live du streamer, et celui de la personne connectée. Absent : hors live.
  ownerTwitchLive?: TwitchLive | undefined;
  twitchLive?: TwitchLive | undefined;
  params?: WelcomeFrame["params"];
  gauge: ServerGauge | null; // `null` pour un invité
  reportCount: number; // les signalements en attente, pour qui modère (JOURNAL 2026-09-28)
  scoreboard?: Scoreboard | undefined; // absent avant sa première frame et après une coupure : le gateway renvoie le sien
  lastError: ErrorCode | null;
  inspection: Inspection | null;
  pixels: Uint8Array; // un octet par case, l'index de palette (§4.3)
};

export type CanvasStore = {
  subscribe(listener: () => void): () => void; // la forme qu'attend `useSyncExternalStore`
  getView(): CanvasView;
  // Pose optimiste (§9.3) : les pixels changent tout de suite, et la promesse se résout sur l'ack du même `requestId`.
  // `placementId` : la pose, le brouillon validé dont ce lot fait partie (JOURNAL 2026-09-28).
  placeBatch(pixels: readonly Pixel[], placementId: string): Promise<PlaceResult>;
  // La couleur d'une case sans les poses en vol : `pixels` porte déjà leur couleur optimiste, jusqu'à l'ack.
  confirmedColorIndexAt(x: number, y: number): number;
  // À chaque ack : les cases acceptées du lot. Un refus, une coupure ou une case venue d'un autre joueur n'y passent jamais.
  listenConfirmed(listener: (pixels: readonly ConfirmedPixel[]) => void): () => void;
  inspect(x: number, y: number): void;
  closeInspection(): void;
  // Réglée à la dernière tranche, avec le total des cases retirées (§4.3).
  moderate(action: ModerationAction): Promise<RequestResult<{ cells: number }>>;
  listPixels(userId: string): Promise<RequestResult<AuthoredPixel[]>>; // un banni : sa preuve
  listBans(): Promise<RequestResult<BannedUser[]>>;
  listModerators(): Promise<RequestResult<ModeratorList>>; // JOURNAL 2026-09-27
  setModerator(userId: string, isModerator: boolean): Promise<RequestResult<ModeratorList>>; // le streamer seul
  setObsDelay(obsDelayMs: number): void; // confirmé par la frame `obsDelay`, qui met à jour `params`
  setObsBackground(obsBackground: ObsBackground): void; // confirmé par la frame `obsBackground` (JOURNAL 2026-09-29)
  // JOURNAL 2026-09-30 : la jauge arrive par l'`ack` ; les bornes, le streamer seul, par la frame `gaugeLimits`.
  claimGauge(): void;
  setGaugeLimits(limits: GaugeLimits): void;
  // JOURNAL 2026-09-28. `range` : ses poses voisines aussi (JOURNAL 2026-09-29).
  report(x: number, y: number, placementId: string, range?: PlacementRange): Promise<RequestResult<true>>;
  // Le streamer seul ; la nouvelle taille arrive par un `welcome` et un snapshot (JOURNAL 2026-09-29).
  resizeCanvas(width: number, height: number): Promise<RequestResult<true>>;
  // Les pixels de l'auteur de cette pose, pour choisir la plage à signaler (JOURNAL 2026-09-29).
  listAuthorPixels(x: number, y: number, placementId: string): Promise<RequestResult<AuthoredPixel[]>>;
  listReports(): Promise<RequestResult<ReportedPlacement[]>>; // pour qui modère
  listenArrivals(listener: (arrival: Arrival) => void): () => void;
  // JOURNAL 2026-10-06 : une liste de l'onglet Modération a bougé ailleurs, et à chaque reprise de la socket.
  listenStaleLists(listener: (list: StaleList) => void): () => void;
  // Écart §4.2 (JOURNAL 2026-10-06) : le développeur seul, le gateway décide. Redit à chaque reprise de la socket.
  watchActivity(isWatching: boolean): void;
  listActivityHistory(period: ActivityPeriod): Promise<RequestResult<ActivityHistory>>;
  listenActivity(listener: (frame: ActivityFrame) => void): () => void;
  // Écart §4.2 (JOURNAL 2026-10-07) : de même pour la capacité, avec ses propres frames.
  watchCapacity(isWatching: boolean): void;
  listCapacityHistory(period: ActivityPeriod): Promise<RequestResult<CapacityHistory>>;
  listenCapacity(listener: (frame: CapacityFrame) => void): () => void;
  close(): void;
};

// Fourni aux routes par le contexte du routeur : `ui/` ouvre un canvas sans connaître `net/`.
export type CanvasOpener = (canvasId: string, mode: CanvasMode) => CanvasStore;

// Un lot envoyé, pas encore confirmé : de quoi rendre à chaque pixel sa couleur d'avant.
type PendingBatch = {
  frame: PlaceFrame; // renvoyée telle quelle après une reprise : même `requestId`, jamais de double pose
  sentAt: Timestamp;
  offsets: number[];
  previousColorIndexes: number[];
  touched: Set<number>; // cases qu'une frame `cells` a écrites depuis : elle fait foi
  resolve(result: PlaceResult): void;
};

type ReplyFrame = Extract<
  ServerFrame,
  {
    t:
      | "moderated"
      | "pixels"
      | "bans"
      | "moderators"
      | "reported"
      | "reports"
      | "authorPixels"
      | "resized"
      | "activityHistory"
      | "capacityHistory";
  }
>;

// Une requête en attente : `receive` rend vrai quand la réponse est complète.
type PendingRequest = { receive(reply: ReplyFrame): boolean; fail(error: ErrorCode | "closed"): void };

// Une frame du suivi du développeur, donnée à chacun de ses écouteurs.
const notify = <Frame>(listeners: ReadonlySet<(frame: Frame) => void>, frame: Frame): void => {
  for (const listener of listeners) listener(frame);
};

const toInspection = ({ x, y, entry }: Extract<ServerFrame, { t: "inspected" }>): Inspection =>
  entry ? { status: "found", x, y, entry } : { status: "empty", x, y };

// La réponse `moderators`, à `listModerators` comme à `setModerator`.
const toModeratorList = (reply: ReplyFrame): ModeratorList | undefined =>
  reply.t === "moderators"
    ? { users: reply.users, ...(reply.twitchSync ? { twitchSync: reply.twitchSync } : {}) }
    : undefined;

// Écart §15 (JOURNAL 2026-10-06) : ce que dit la frame `canvasStatus` du canvas ouvert.
const toStatusView = (status: CanvasStatus): Partial<CanvasView> =>
  status === "discarded" ? { isDiscarded: true } : { isArchived: status === "archived", isDiscarded: false };

// Écart §4 (JOURNAL 2026-10-07) : le gateway n'envoie que le live du streamer et celui de cette personne ; la frame sans live l'efface.
const toTwitchLiveView = (
  { ownerId, userId }: Pick<CanvasView, "ownerId" | "userId">,
  frame: Extract<ServerFrame, { t: "twitchLive" }>,
): Partial<CanvasView> => ({
  ...(frame.userId === ownerId ? { ownerTwitchLive: frame.twitchLive } : {}),
  ...(frame.userId === userId ? { twitchLive: frame.twitchLive } : {}),
});

export function createCanvasStore(
  canvasId: string,
  transport: Transport,
  options: CanvasStoreOptions,
): CanvasStore {
  let view: CanvasView = {
    status: "connecting",
    width: 0,
    height: 0,
    palette: [],
    version: 0,
    gauge: null,
    reportCount: 0,
    lastError: null,
    inspection: null,
    isBanned: false,
    isArchived: false,
    isDiscarded: false,
    pixels: new Uint8Array(0),
  };
  const listeners = new Set<() => void>();
  const pending = new Map<string, PendingBatch>();
  const requests = new Map<string, PendingRequest>();
  let inspectRequestId: string | null = null; // seule la dernière inspection attend sa réponse
  let previousInspection: Inspection | null = null; // rendue si le gateway refuse la suivante (JOURNAL 2026-09-27)
  const arrivalListeners = new Set<(arrival: Arrival) => void>();
  const confirmedListeners = new Set<(pixels: readonly ConfirmedPixel[]) => void>();
  const staleListeners = new Set<(list: StaleList) => void>();
  const activityListeners = new Set<(frame: ActivityFrame) => void>();
  let isWatchingActivity = false;
  const capacityListeners = new Set<(frame: CapacityFrame) => void>();
  let isWatchingCapacity = false;
  let hasWelcomed = false; // une reprise porte `lastVersion` (§4.5)
  // Écart §15 (JOURNAL 2026-10-06) : fermé par la page qui change de canvas, le socket qui tombe ensuite
  // n'est pas une coupure : rien ne reprendra, et rien ne l'annonce.
  let isClosedByPage = false;
  let heldRecent: CellsFrame | null = null; // le `recent` du `welcome`, rendu avec le snapshot qui le suit
  let missingAsk = 0; // la dernière demande au web : une réponse plus ancienne, ou d'avant un `welcome`, ne compte plus

  const emit = (arrival: Arrival): void => {
    for (const listener of arrivalListeners) listener(arrival);
  };

  const emitStale = (list: StaleList): void => {
    for (const listener of staleListeners) listener(list);
  };

  // Un nouvel objet à chaque changement : `useSyncExternalStore` compare les références.
  const publish = (next: Partial<CanvasView>): void => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  // §5.3 : une case d'avant une nouvelle taille peut tomber hors du cadre.
  const writeCell = ({ x, y, colorIndex }: BroadcastCell): void => {
    if (x >= view.width || y >= view.height) return;
    const offset = toStateOffset(x, y, view.width);
    view.pixels[offset] = colorIndex;
    for (const batch of pending.values()) if (batch.offsets.includes(offset)) batch.touched.add(offset);
  };

  // Le seul chemin d'écriture des cases venues du serveur : flux live, et plus tard resync et vue OBS (§9.2).
  // §4.3 : `hide` et `unhide` ne regardent que le stream, la page garde l'état réel.
  const apply = (frame: CellsFrame): void => {
    for (const cell of frame.cells) if (cell.kind === "place" || cell.kind === "clear") writeCell(cell);
    publish({ version: frame.toVersion });
    emit({ kind: "cells", frame: { toVersion: frame.toVersion, cells: frame.cells } });
  };

  const restore = (batch: PendingBatch, indexes: readonly number[]): void => {
    for (const index of indexes) {
      const offset = batch.offsets[index];
      const previous = batch.previousColorIndexes[index];
      if (offset !== undefined && previous !== undefined && !batch.touched.has(offset))
        view.pixels[offset] = previous;
    }
  };

  const failAllRequests = (error: ErrorCode | "closed"): void => {
    for (const request of requests.values()) request.fail(error);
    requests.clear();
  };

  const answer = (reply: ReplyFrame): void => {
    if (requests.get(reply.requestId)?.receive(reply)) requests.delete(reply.requestId);
  };

  // `settle` rend la valeur quand la réponse est complète, rien sinon.
  const request = <T>(
    frame: Extract<ClientFrame, { requestId: string }>,
    settle: (reply: ReplyFrame) => T | undefined,
  ): Promise<RequestResult<T>> =>
    new Promise((resolve) => {
      requests.set(frame.requestId, {
        receive(reply) {
          const value = settle(reply);
          if (value !== undefined) resolve({ ok: true, value });
          return value !== undefined;
        },
        fail: (error) => resolve({ ok: false, error }),
      });
      transport.send(frame);
    });

  // Sans ack, aucun pixel du lot n'est confirmé : tous reprennent leur couleur.
  const settle = (requestId: string, batch: PendingBatch, result: PlaceResult): void => {
    restore(
      batch,
      batch.offsets.map((_, index) => index),
    );
    batch.resolve(result);
    pending.delete(requestId);
  };

  const settleAllPending = (result: PlaceResult): void => {
    for (const [requestId, batch] of pending) settle(requestId, batch, result);
  };

  // Après une reprise : les lots récents repartent avec leur `requestId`, les autres échouent (JOURNAL 2026-09-25).
  const resendPending = (): void => {
    for (const [requestId, batch] of pending) {
      if (options.now() - batch.sentAt > RESEND_MAX_AGE_MS)
        settle(requestId, batch, { ok: false, error: "closed" });
      else transport.send(batch.frame);
    }
  };

  // Les cases acceptées du lot, avec la couleur qu'elles remplacent : l'ack seul les confirme.
  const emitConfirmed = (batch: PendingBatch, rejectedIndexes: readonly number[]): void => {
    const confirmed = batch.frame.pixels.flatMap((pixel, index) => {
      const previousColorIndex = batch.previousColorIndexes[index];
      return rejectedIndexes.includes(index) || previousColorIndex === undefined
        ? []
        : [{ ...pixel, previousColorIndex }];
    });
    if (confirmed.length > 0) for (const listener of confirmedListeners) listener(confirmed);
  };

  const acknowledge = (ack: AckFrame): void => {
    const batch = pending.get(ack.requestId);
    if (batch) {
      pending.delete(ack.requestId);
      const rejectedIndexes = ack.rejected.map((rejected) => rejected.index);
      restore(batch, rejectedIndexes);
      batch.resolve({ ok: true, value: ack });
      emitConfirmed(batch, rejectedIndexes);
    }
    publish({ gauge: ack.gauge, lastError: null });
  };

  const welcomeView = (frame: WelcomeFrame): Partial<CanvasView> => {
    const { width, height, ownerId } = frame.canvas;
    const { userId, login, displayName, avatarUrl, role } = frame.you;
    return {
      status: "live",
      width,
      height,
      ownerId,
      palette: frame.palette,
      version: frame.version,
      role,
      isArchived: frame.canvas.archivedAt !== undefined,
      ownerTwitchLive: frame.canvas.ownerTwitchLive,
      twitchLive: frame.you.twitchLive,
      params: frame.params,
      gauge: frame.gauge ?? null,
      ...(userId ? { userId } : {}),
      ...(login ? { login } : {}),
      ...(displayName ? { displayName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      // Un resync n'a pas de snapshot : la copie reste, et les cases manquées arrivent par `cells` (§4.5).
      pixels: view.pixels.length === width * height ? view.pixels : new Uint8Array(width * height),
    };
  };

  const welcome = (frame: WelcomeFrame): void => {
    heldRecent = frame.recent ?? null;
    missingAsk += 1;
    // Le canvas existe : un `welcome` démentit `canvas_not_found` et `canvas_recovering`, les autres refus restent.
    const isDisproved = view.lastError === "canvas_not_found" || view.lastError === "canvas_recovering";
    publish({ ...welcomeView(frame), ...(isDisproved ? { lastError: null } : {}) });
    if (hasWelcomed) {
      resendPending();
      // Pendant la coupure, rien n'a dit ce qui a bougé.
      emitStale("bans");
      emitStale("moderators");
      // La nouvelle connexion ne sait pas que le développeur regarde (écart §4.2, JOURNAL 2026-10-06).
      if (isWatchingActivity) transport.send({ t: "watchActivity", isWatching: true });
      if (isWatchingCapacity) transport.send({ t: "watchCapacity", isWatching: true });
    }
    hasWelcomed = true;
  };

  // Écart §4.2 (JOURNAL 2026-10-09) : le gateway ne trouve pas un canvas que Convex connaît, souvent parce que Redis vient de
  // le perdre et que personne ne l'a encore marqué. La page ne dit rien tant que le web n'a pas répondu, puis « introuvable »
  // seulement si rien ne le ramènera ; une panne du web, ou un canvas qui vit, est une attente.
  const askIfMissing = (ask: (canvasId: string) => Promise<boolean>): void => {
    if (view.lastError === "canvas_not_found") return; // déjà confirmé : Convex n'est pas relu à chaque reprise
    missingAsk += 1;
    const asked = missingAsk;
    void ask(canvasId)
      .catch(() => false)
      .then((isMissing) => {
        if (asked !== missingAsk || isClosedByPage) return;
        publish({ lastError: isMissing ? "canvas_not_found" : "canvas_recovering" });
      });
  };

  // Une `error` n'a pas de `requestId` : tout ce qui attend échoue.
  const refuse = (code: ErrorCode): void => {
    // §4.5 : le code a changé pendant la coupure, la page va le chercher.
    if (code === "protocol_version" && hasWelcomed) {
      options.reload();
      return;
    }
    settleAllPending({ ok: false, error: code });
    failAllRequests(code);
    if (code === "canvas_not_found" && options.mode === "ui" && options.isMissingConfirmed) {
      askIfMissing(options.isMissingConfirmed);
      return;
    }
    publish({ lastError: code });
    // Au tout premier `hello`, la page est déjà la dernière : reprendre ne ferait que reboucler.
    if (code !== "protocol_version") return;
    transport.close();
    publish({ status: "closed" });
  };

  // Écart §15 (JOURNAL 2026-10-06) : une écriture refusée parce que le canvas est archivé vaut pour tout ce qui attend.
  // Pas de `lastError` : ce n'est pas un refus à montrer, la page va suivre le canvas actif.
  const archive = (): void => {
    settleAllPending({ ok: false, error: "canvas_archived" });
    failAllRequests("canvas_archived");
    publish({ isArchived: true });
  };

  // §4.3 : une `error` qui nomme sa requête ne concerne qu'elle. Un lot refusé (§6.3 : dix poses par seconde) rend ses
  // pixels, comme sans ack : la page se redessine.
  const refuseRequest = (requestId: string, code: ErrorCode): void => {
    const batch = pending.get(requestId);
    if (batch) {
      settle(requestId, batch, { ok: false, error: code });
      publish({});
      return;
    }
    if (requestId === inspectRequestId) {
      inspectRequestId = null;
      publish({ inspection: previousInspection });
      return;
    }
    requests.get(requestId)?.fail(code);
    requests.delete(requestId);
  };

  // Un réglage pris aussitôt : le délai (JOURNAL 2026-09-25), le fond (JOURNAL 2026-09-29), les bornes de la jauge
  // (JOURNAL 2026-09-30).
  const takeSetting = ({
    t,
    ...change
  }: Extract<ServerFrame, { t: "obsDelay" | "obsBackground" | "gaugeLimits" }>): void => {
    if (view.params) publish({ params: { ...view.params, ...change } });
  };

  // Écart §8.1 (JOURNAL 2026-10-07) : sans `theme`, le canvas n'en a plus ; le reste de `params` ne bouge pas.
  const takeTheme = ({ theme }: Extract<ServerFrame, { t: "theme" }>): void => {
    if (!view.params) return;
    const { theme: previous, ...rest } = view.params;
    publish({ params: theme === undefined ? rest : { ...rest, theme } });
  };

  const onInspected = (frame: Extract<ServerFrame, { t: "inspected" }>): void => {
    if (frame.requestId !== inspectRequestId) return;
    inspectRequestId = null;
    publish({ inspection: toInspection(frame) });
  };

  const onFrame = (frame: ServerFrame): void => {
    switch (frame.t) {
      case "welcome":
        welcome(frame);
        break;
      case "cells":
        apply(frame);
        break;
      case "ack":
        acknowledge(frame);
        break;
      case "gauge": {
        const { t, ...gauge } = frame;
        publish({ gauge });
        break;
      }
      case "inspected":
        onInspected(frame);
        break;
      case "moderated":
      case "pixels":
      case "bans":
      case "moderators":
      case "reported":
      case "reports":
      case "authorPixels":
      case "resized":
      case "activityHistory":
      case "capacityHistory":
        answer(frame);
        break;
      case "activity":
        notify(activityListeners, frame);
        break;
      case "capacity":
        notify(capacityListeners, frame);
        break;
      case "reportCount":
        publish({ reportCount: frame.count });
        break;
      case "staleList":
        emitStale(frame.list);
        break;
      case "scoreboard": {
        const { t, ...scoreboard } = frame;
        publish({ scoreboard });
        break;
      }
      case "banned":
      case "unbanned":
        publish({ isBanned: frame.t === "banned" });
        break;
      // §10.3 : nommé ou retiré pendant la session, la modération apparaît ou part.
      case "role":
        publish({ role: frame.role });
        break;
      case "obsDelay":
      case "obsBackground":
      case "gaugeLimits":
        takeSetting(frame);
        break;
      case "theme":
        takeTheme(frame);
        break;
      case "canvasStatus":
        publish(toStatusView(frame.status));
        break;
      case "twitchLive":
        publish(toTwitchLiveView(view, frame));
        break;
      case "error":
        if (frame.code === "canvas_archived") archive();
        else if (frame.requestId) refuseRequest(frame.requestId, frame.code);
        else refuse(frame.code);
        break;
      default:
    }
  };

  transport.listen({
    // À chaque ouverture ; après une première réponse, avec la dernière version reçue (§4.5).
    onOpen: () =>
      transport.send({
        t: "hello",
        protocolVersion: PROTOCOL_VERSION,
        canvasId,
        mode: options.mode,
        ...(hasWelcomed ? { lastVersion: view.version } : {}),
      }),
    onFrame,
    // Le snapshot suit le `welcome` : il remplace la copie entière (§6.1).
    onSnapshot: (state) => {
      publish({ pixels: state.slice() });
      emit({ kind: "snapshot", pixels: state.slice(), recent: heldRecent });
      heldRecent = null;
    },
    // Les lots attendent la reprise (JOURNAL 2026-09-25) ; les modérations et les lectures échouent.
    onClose: () => {
      failAllRequests("closed");
      // Écart §15 (JOURNAL 2026-10-06) : fermé par la page, le store n'annonce rien : ni reprise, ni classement effacé.
      if (isClosedByPage) return;
      if (view.status !== "closed") publish({ status: "reconnecting" });
      // Après une coupure, rien n'est sûr : la page efface son classement, et le gateway lui renvoie le sien.
      if (view.scoreboard) publish({ scoreboard: undefined });
    },
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getView: () => view,
    placeBatch(pixels, placementId) {
      const requestId = crypto.randomUUID();
      const offsets = pixels.map(({ x, y }) => toStateOffset(x, y, view.width));
      const previousColorIndexes = offsets.map((offset) => view.pixels[offset] ?? 0);
      pixels.forEach(({ colorIndex }, index) => {
        const offset = offsets[index];
        if (offset !== undefined) view.pixels[offset] = colorIndex;
      });
      const frame: PlaceFrame = { t: "place", requestId, placementId, pixels: [...pixels] };
      const placed = new Promise<PlaceResult>((resolve) => {
        const sentAt = options.now();
        pending.set(requestId, { frame, sentAt, offsets, previousColorIndexes, touched: new Set(), resolve });
      });
      publish({});
      transport.send(frame);
      return placed;
    },
    // Comme `restore` : un lot en vol rend sa couleur d'avant, sauf à une case qu'une frame `cells` a écrite depuis.
    confirmedColorIndexAt(x, y) {
      const offset = toStateOffset(x, y, view.width);
      for (const batch of pending.values()) {
        const previous = batch.previousColorIndexes[batch.offsets.indexOf(offset)];
        if (previous !== undefined && !batch.touched.has(offset)) return previous;
      }
      return view.pixels[offset] ?? TRANSPARENT_COLOR_INDEX;
    },
    listenConfirmed(listener) {
      confirmedListeners.add(listener);
      return () => confirmedListeners.delete(listener);
    },
    inspect(x, y) {
      if (view.inspection?.status !== "loading") previousInspection = view.inspection;
      inspectRequestId = crypto.randomUUID();
      publish({ inspection: { status: "loading", x, y } });
      transport.send({ t: "inspect", requestId: inspectRequestId, x, y });
    },
    closeInspection() {
      inspectRequestId = null;
      publish({ inspection: null });
    },
    moderate(action) {
      let cells = 0;
      return request({ t: "moderate", requestId: crypto.randomUUID(), action }, (reply) => {
        if (reply.t !== "moderated") return undefined;
        cells += reply.cells;
        return reply.done ? { cells } : undefined;
      });
    },
    listPixels: (userId) =>
      request({ t: "listPixels", requestId: crypto.randomUUID(), userId }, (reply) =>
        reply.t === "pixels" ? reply.pixels : undefined,
      ),
    listBans: () =>
      request({ t: "listBans", requestId: crypto.randomUUID() }, (reply) =>
        reply.t === "bans" ? reply.users : undefined,
      ),
    listModerators: () => request({ t: "listModerators", requestId: crypto.randomUUID() }, toModeratorList),
    setModerator: (userId, isModerator) =>
      request({ t: "setModerator", requestId: crypto.randomUUID(), userId, isModerator }, toModeratorList),
    setObsDelay: (obsDelayMs) =>
      transport.send({ t: "setObsDelay", requestId: crypto.randomUUID(), obsDelayMs }),
    setObsBackground: (obsBackground) =>
      transport.send({ t: "setObsBackground", requestId: crypto.randomUUID(), obsBackground }),
    claimGauge: () => transport.send({ t: "claimGauge", requestId: crypto.randomUUID() }),
    // Les deux bornes seules : la frame est stricte, et `params` porte bien d'autres réglages.
    setGaugeLimits: ({ gaugeMaxStart, gaugeMaxCeiling }) =>
      transport.send({ t: "setGaugeLimits", requestId: crypto.randomUUID(), gaugeMaxStart, gaugeMaxCeiling }),
    report: (x, y, placementId, range) =>
      request(
        { t: "report", requestId: crypto.randomUUID(), x, y, placementId, ...(range ? { range } : {}) },
        (reply) => (reply.t === "reported" ? true : undefined),
      ),
    resizeCanvas: (width, height) =>
      request({ t: "resizeCanvas", requestId: crypto.randomUUID(), width, height }, (reply) =>
        reply.t === "resized" ? true : undefined,
      ),
    listAuthorPixels: (x, y, placementId) =>
      request({ t: "listAuthorPixels", requestId: crypto.randomUUID(), x, y, placementId }, (reply) =>
        reply.t === "authorPixels" ? reply.pixels : undefined,
      ),
    listReports: () =>
      request({ t: "listReports", requestId: crypto.randomUUID() }, (reply) =>
        reply.t === "reports" ? reply.reports : undefined,
      ),
    listenArrivals(listener) {
      arrivalListeners.add(listener);
      return () => arrivalListeners.delete(listener);
    },
    listenStaleLists(listener) {
      staleListeners.add(listener);
      return () => staleListeners.delete(listener);
    },
    watchActivity(isWatching) {
      isWatchingActivity = isWatching;
      transport.send({ t: "watchActivity", isWatching });
    },
    listActivityHistory: (period) =>
      request({ t: "listActivityHistory", requestId: crypto.randomUUID(), period }, (reply) =>
        reply.t === "activityHistory"
          ? { points: reply.points, canvasPoints: reply.canvasPoints }
          : undefined,
      ),
    listenActivity(listener) {
      activityListeners.add(listener);
      return () => activityListeners.delete(listener);
    },
    watchCapacity(isWatching) {
      isWatchingCapacity = isWatching;
      transport.send({ t: "watchCapacity", isWatching });
    },
    listCapacityHistory: (period) =>
      request({ t: "listCapacityHistory", requestId: crypto.randomUUID(), period }, (reply) =>
        reply.t === "capacityHistory" ? { points: reply.points } : undefined,
      ),
    listenCapacity(listener) {
      capacityListeners.add(listener);
      return () => capacityListeners.delete(listener);
    },
    close() {
      isClosedByPage = true;
      transport.close();
    },
  };
}
