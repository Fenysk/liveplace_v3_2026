// Le suivi d'activité vu du gateway (écart §4.3 et §5.1, JOURNAL 2026-10-06 et 2026-10-07) : qui est connecté, où, depuis
// quand, les pixels acceptés, et l'audience : visites, temps passé, comptes, joueurs et streamers. La liste des connexions
// reste en mémoire ; Redis ne garde que des nombres. Chaque canvas a aussi ses nombres (`canvas-activity.ts`), pour `here`.

import {
  type ActivityPeriod,
  DEVICES,
  type Device,
  isDeveloper,
  MINUTE_MS,
  type Role,
  type Session,
  type Timestamp,
  toHourStart,
  toMinuteStart,
} from "@liveplace/domain";
import type {
  ActivityAudience,
  ActivityCanvas,
  ActivityFrame,
  ActivityHere,
  ActivityHistory,
  ActivityStore,
  ActivityUser,
  CanvasCore,
  CanvasMinute,
  CanvasPixelsMinute,
  ClientSocket,
  ConnectedAccount,
  DaySignups,
  TwitchLive,
} from "@liveplace/domain/ports";
import { addTo, createCanvasCounts, createRecentPixels } from "./canvas-activity";

// §3 du cahier des charges : la frame part toutes les 2 s, tant que le développeur regarde.
export const ACTIVITY_TICK_MS = 2000;
// La température : la minute en cours et les 59 d'avant.
const HEAT_PAST_MINUTES = 59;
const OWNER_CACHE_MS = 10 * MINUTE_MS; // le nom ou la photo d'un streamer peut changer à sa prochaine connexion

export type ActivityDeps = {
  store: ActivityStore;
  // Le streamer d'un canvas où il ne reste que des pixels récents, et le live de chaque streamer listé (Écart §4, JOURNAL 2026-10-07)
  core: Pick<CanvasCore, "getCanvas" | "listTwitchLives">;
  now: () => Timestamp;
  isProduction: boolean; // là seulement, les pages et les pixels du développeur ne comptent pas
};

// Une page canvas ouverte, en jeu ou en vue OBS.
export type ActivityPage = {
  canvasId: string;
  ownerId: string;
  mode: "ui" | "obs";
  session: Session | null;
  role: Role;
  device: Device;
  isResumed: boolean; // un `hello` avec `lastVersion` : la même page qui reprend, pas une visite
};

// Ce que la connexion garde de sa page : son rôle se relit en direct (§10.3).
export type ActivityMember = { setRole(role: Role): void; leave(): void };

export interface Activity {
  join(page: ActivityPage): ActivityMember;
  countPixels(canvasId: string, userId: string, pixels: number): void; // à chaque pose acceptée : rien de lourd
  // Ignoré hors du développeur. `canvasId` : le canvas de la socket, que `here` décrit ; sans lui, la frame n'a pas de `here`.
  watch(socket: ClientSocket, session: Session | null, isWatching: boolean, canvasId?: string): void;
  listHistory(
    session: Session | null,
    period: ActivityPeriod,
    canvasId: string,
  ): Promise<ActivityHistory | null>; // `null` : refusé
  tick(): Promise<void>; // toutes les 2 s : la minute écoulée part dans Redis, la frame aux sockets qui regardent
  start(): Promise<void>; // au démarrage : la température d'avant, et l'élagage
}

type OpenPage = ActivityPage & { connectedAt: Timestamp; isCounted: boolean };

// La minute en cours : le pic des personnes et des canvas streamés, les pixels, et ceux de chaque canvas, les visites
// dont celles au téléphone, le temps passé en minutes entières (posé à la fermeture), et les identifiants vus.
type OpenMinute = {
  at: Timestamp;
  people: number;
  streamed: number;
  pixels: number;
  visits: number;
  phoneVisits: number;
  visitMinutes: number;
  pixelsByCanvas: Map<string, number>;
  canvases: ReadonlyMap<string, CanvasMinute>; // posé à la fermeture, pour les seuls canvas où il s'est passé quelque chose
  accountIds: Set<string>;
  playerIds: Set<string>;
  streamedCanvasIds: Set<string>;
};

// Un canvas tel que la frame le montre, avant son streamer et sa température.
type CanvasTally = {
  canvasId: string;
  ownerId: string;
  obsViews: number;
  guests: number;
  countedUserIds: Set<string>;
  accounts: Map<string, ConnectedAccount>;
};

const byHeatThenPeople = (left: ActivityCanvas, right: ActivityCanvas): number =>
  right.heat - left.heat || right.people - left.people;

// Un compte sur ce canvas : sa plus ancienne page, ses appareils dans l'ordre de `DEVICES`.
const toConnectedAccount = (
  known: ConnectedAccount | undefined,
  page: OpenPage,
  session: Session,
): ConnectedAccount => {
  const devices = new Set([...(known?.devices ?? []), page.device]);
  return {
    userId: session.userId,
    login: session.login,
    displayName: session.displayName,
    ...(session.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
    role: page.role,
    connectedAt: Math.min(known?.connectedAt ?? page.connectedAt, page.connectedAt),
    devices: DEVICES.filter((device) => devices.has(device)),
  };
};

const emptyTally = (canvasId: string, ownerId: string): CanvasTally => ({
  canvasId,
  ownerId,
  obsViews: 0,
  guests: 0,
  countedUserIds: new Set(),
  accounts: new Map(),
});

// Une page de plus sur son canvas : une vue OBS, un invité, ou un compte, compté ou non mais toujours listé.
const addPage = (canvas: CanvasTally, page: OpenPage): void => {
  if (page.mode === "obs") canvas.obsViews += Number(page.isCounted);
  else if (!page.session) canvas.guests += Number(page.isCounted);
  else {
    const { userId } = page.session;
    if (page.isCounted) canvas.countedUserIds.add(userId);
    canvas.accounts.set(userId, toConnectedAccount(canvas.accounts.get(userId), page, page.session));
  }
};

// Les sommes de la minute en cours s'ajoutent à l'audience gardée ; ses identifiants sont déjà dans la lecture.
const addOpenMinute = <
  Counts extends Pick<ActivityAudience["today"], "visits" | "phoneVisits" | "visitMinutes">,
>(
  counts: Counts,
  open: Pick<ActivityAudience["today"], "visits" | "phoneVisits" | "visitMinutes">,
): Counts => ({
  ...counts,
  visits: counts.visits + open.visits,
  phoneVisits: counts.phoneVisits + open.phoneVisits,
  visitMinutes: counts.visitMinutes + open.visitMinutes,
});

export function createActivity(deps: ActivityDeps): Activity {
  const pages = new Set<OpenPage>();
  const watchers = new Map<ClientSocket, string | undefined>(); // la socket, et le canvas qu'elle décrit s'il y en a un
  const canvasCounts = createCanvasCounts();
  const writtenCanvasIds = new Set<string>(); // les canvas écrits depuis le dernier élagage
  // Tenus à chaque arrivée et départ : le pic d'une minute ne coûte rien.
  const accountPages = new Map<string, number>(); // `userId` → ses pages en jeu
  const obsPages = new Map<string, number>(); // `canvasId` → ses vues OBS
  let guestPages = 0;
  // Le temps passé (JOURNAL 2026-10-07) : les pages du jeu ouvertes fois la durée écoulée, en millisecondes. Les minutes
  // entières partent avec la minute qui se ferme, le reste attend la suivante : aucune seconde n'est perdue.
  let uiPages = 0;
  let pendingVisitMs = 0;
  let accruedAt = deps.now();
  const recentPixels = createRecentPixels();
  const openMinute = (at: Timestamp): OpenMinute => ({
    at,
    people: accountPages.size + guestPages,
    streamed: obsPages.size,
    pixels: 0,
    visits: 0,
    phoneVisits: 0,
    visitMinutes: 0,
    pixelsByCanvas: new Map(),
    canvases: new Map(),
    accountIds: new Set(),
    playerIds: new Set(),
    streamedCanvasIds: new Set(obsPages.keys()),
  });
  let minute = openMinute(toMinuteStart(deps.now()));
  let pastMinutes: CanvasPixelsMinute[] = [];
  const closedMinutes: OpenMinute[] = [];
  let prunedHourAt = toHourStart(deps.now());
  let isTicking = false;
  const owners = new Map<string, { user: ActivityUser; readAt: Timestamp }>();
  const canvasOwners = new Map<string, string>(); // `canvasId` → `ownerId`, qui ne change jamais

  const isCounted = (userId: string | undefined): boolean => !(deps.isProduction && isDeveloper(userId));

  const accrueVisitTime = (nowMs: Timestamp): void => {
    pendingVisitMs += uiPages * Math.max(0, nowMs - accruedAt);
    accruedAt = Math.max(accruedAt, nowMs);
  };

  // Une minute sans serveur reste un trou : on ne comble pas, on ferme la minute et on ouvre celle du moment.
  const rollMinute = (nowMs: Timestamp): void => {
    const at = toMinuteStart(nowMs);
    if (at <= minute.at) return;
    accrueVisitTime(minute.at + MINUTE_MS);
    minute.visitMinutes = Math.floor(pendingVisitMs / MINUTE_MS);
    pendingVisitMs -= minute.visitMinutes * MINUTE_MS;
    minute.canvases = canvasCounts.roll(minute.at + MINUTE_MS, at, minute.pixelsByCanvas);
    closedMinutes.push(minute);
    pastMinutes = [...pastMinutes, { at: minute.at, pixelsByCanvas: minute.pixelsByCanvas }].filter(
      (past) => past.at >= at - HEAT_PAST_MINUTES * MINUTE_MS,
    );
    minute = openMinute(at);
    accruedAt = at;
  };

  const tallyEverywhere = (page: OpenPage, delta: number): void => {
    if (page.mode === "obs") {
      addTo(obsPages, page.canvasId, delta);
      if (delta > 0) minute.streamedCanvasIds.add(page.canvasId);
    } else {
      uiPages += delta;
      if (page.session) addTo(accountPages, page.session.userId, delta);
      else guestPages += delta;
    }
    minute.people = Math.max(minute.people, accountPages.size + guestPages);
    minute.streamed = Math.max(minute.streamed, obsPages.size);
  };

  // Une page comptée, dans les chiffres de tout LivePlace comme dans ceux de son canvas.
  const tally = (page: OpenPage, delta: number, nowMs: Timestamp): void => {
    if (!page.isCounted) return;
    tallyEverywhere(page, delta);
    if (delta > 0) canvasCounts.join(page, nowMs);
    else canvasCounts.leave(page, nowMs);
  };

  // Une visite : la page du jeu qui s'ouvre, jamais celle qui reprend ni la vue OBS ; le compte compte pour la minute.
  const countVisit = (page: OpenPage): void => {
    if (!page.isCounted || page.mode !== "ui" || page.isResumed) return;
    minute.visits += 1;
    if (page.device === "phone") minute.phoneVisits += 1;
    if (page.session) minute.accountIds.add(page.session.userId);
    canvasCounts.countVisit(page.canvasId, page.device);
  };

  const heatByCanvas = (): Map<string, number> => {
    const heat = new Map<string, number>();
    for (const { pixelsByCanvas } of [...pastMinutes, minute])
      for (const [canvasId, pixels] of pixelsByCanvas) addTo(heat, canvasId, pixels);
    return heat;
  };

  const tallyCanvases = (): Map<string, CanvasTally> => {
    const canvases = new Map<string, CanvasTally>();
    for (const page of pages) {
      const canvas = canvases.get(page.canvasId) ?? emptyTally(page.canvasId, page.ownerId);
      canvases.set(page.canvasId, canvas);
      addPage(canvas, page);
    }
    return canvases;
  };

  const getOwnerId = async (canvasId: string): Promise<string | null> => {
    const known = canvasOwners.get(canvasId);
    if (known) return known;
    const meta = await deps.core.getCanvas(canvasId);
    if (meta) canvasOwners.set(canvasId, meta.ownerId);
    return meta?.ownerId ?? null;
  };

  // Le miroir `user:` du streamer, gardé quelques minutes ; sans miroir, son identifiant tient lieu de nom.
  const getOwner = async (ownerId: string, nowMs: Timestamp): Promise<ActivityUser> => {
    const known = owners.get(ownerId);
    if (known && nowMs - known.readAt < OWNER_CACHE_MS) return known.user;
    const user = (await deps.store.getUser(ownerId)) ?? {
      userId: ownerId,
      login: ownerId,
      displayName: ownerId,
    };
    owners.set(ownerId, { user, readAt: nowMs });
    return user;
  };

  // Écart §4 (JOURNAL 2026-10-07) : le streamer porte son live Twitch, lu à chaque frame (le miroir `user:` est gardé, pas le live).
  const getOwnerWithLive = async (
    ownerId: string,
    nowMs: Timestamp,
    lives: ReadonlyMap<string, TwitchLive>,
  ): Promise<ActivityUser> => {
    const twitchLive = lives.get(ownerId);
    return { ...(await getOwner(ownerId, nowMs)), ...(twitchLive ? { twitchLive } : {}) };
  };

  // Un canvas de la liste, sans ses nouveaux comptes du jour : `here` n'en a pas, son audience a les siens.
  const toCanvasNow = async (
    { canvasId, ownerId, obsViews, guests, countedUserIds, accounts }: CanvasTally,
    heat: number,
    nowMs: Timestamp,
    lives: ReadonlyMap<string, TwitchLive>,
  ): Promise<Omit<ActivityCanvas, "signups">> => ({
    canvasId,
    owner: await getOwnerWithLive(ownerId, nowMs, lives),
    obsViews,
    people: countedUserIds.size + guests,
    guests,
    heat,
    accounts: [...accounts.values()].sort((left, right) => left.connectedAt - right.connectedAt),
  });

  const toCanvas = async (
    canvas: CanvasTally,
    heat: number,
    signups: DaySignups,
    nowMs: Timestamp,
    lives: ReadonlyMap<string, TwitchLive>,
  ): Promise<ActivityCanvas> => ({
    ...(await toCanvasNow(canvas, heat, nowMs, lives)),
    signups: signups.byDiscoveredViaUserId.get(canvas.ownerId) ?? 0,
  });

  // Les canvas chauds sans personne dessus : leur streamer se lit dans `meta`, une fois.
  const addHotCanvases = async (canvases: Map<string, CanvasTally>, heat: Map<string, number>) => {
    for (const canvasId of heat.keys()) {
      if (canvases.has(canvasId)) continue;
      const ownerId = await getOwnerId(canvasId);
      if (ownerId) canvases.set(canvasId, emptyTally(canvasId, ownerId));
    }
  };

  // Le canvas d'une socket, décrit comme dans la liste des canvas, avec ses pixels de la dernière minute et son audience :
  // absent si le noyau ne le connaît pas.
  const buildHere = async (
    canvasId: string,
    canvases: Map<string, CanvasTally>,
    heat: Map<string, number>,
    nowMs: Timestamp,
    lives: ReadonlyMap<string, TwitchLive>,
  ): Promise<ActivityHere | null> => {
    const ownerId = canvases.get(canvasId)?.ownerId ?? (await getOwnerId(canvasId));
    if (!ownerId) return null;
    // Pris avant d'attendre, comme pour tout LivePlace.
    const open = canvasCounts.getOpenMinute(canvasId, nowMs);
    const pixels = canvasCounts.getRecentPixels(canvasId, nowMs);
    // Un canvas hors de la liste n'a pas vu son streamer lu avec les autres.
    const ownerLives = canvases.has(canvasId) ? lives : await deps.core.listTwitchLives([ownerId]);
    const [canvas, audience] = await Promise.all([
      toCanvasNow(
        canvases.get(canvasId) ?? emptyTally(canvasId, ownerId),
        heat.get(canvasId) ?? 0,
        nowMs,
        ownerLives,
      ),
      deps.store.getCanvasAudience(canvasId, nowMs, open.playerIds),
    ]);
    return {
      ...canvas,
      pixels,
      audience: { today: addOpenMinute(audience.today, open), month: addOpenMinute(audience.month, open) },
    };
  };

  // Construites une fois par envoi, le même objet pour chaque socket qui regarde le même canvas, ou aucun.
  const buildFrames = async (
    nowMs: Timestamp,
    canvasIds: ReadonlySet<string | undefined>,
  ): Promise<Map<string | undefined, ActivityFrame>> => {
    const heat = heatByCanvas();
    const canvases = tallyCanvases();
    // Pris avant d'attendre : une page qui s'ouvre pendant la lecture change de minute, pas ce que la lecture a compté.
    const open = {
      visits: minute.visits,
      phoneVisits: minute.phoneVisits,
      visitMinutes: Math.floor(pendingVisitMs / MINUTE_MS),
    };
    const [signups, audience] = await Promise.all([
      deps.store.getDaySignups(nowMs),
      deps.store.getAudience(nowMs, minute),
      addHotCanvases(canvases, heat),
    ]);
    // Le live de tous les streamers listés, en une seule lecture.
    const lives = await deps.core.listTwitchLives([
      ...new Set([...canvases.values()].map((canvas) => canvas.ownerId)),
    ]);
    const shown = await Promise.all(
      [...canvases.values()].map((canvas) =>
        toCanvas(canvas, heat.get(canvas.canvasId) ?? 0, signups, nowMs, lives),
      ),
    );
    const frame: ActivityFrame = {
      t: "activity",
      now: {
        people: accountPages.size + guestPages,
        guests: guestPages,
        streamed: obsPages.size,
        pixels: recentPixels.sum(nowMs),
        signups: signups.total,
      },
      audience: { today: addOpenMinute(audience.today, open), month: addOpenMinute(audience.month, open) },
      canvases: shown.sort(byHeatThenPeople),
    };
    const frames = new Map<string | undefined, ActivityFrame>();
    for (const canvasId of canvasIds) {
      const here = canvasId === undefined ? null : await buildHere(canvasId, canvases, heat, nowMs, lives);
      frames.set(canvasId, here ? { ...frame, here } : frame);
    }
    return frames;
  };

  // Une minute n'est retirée de la file qu'une fois écrite : Redis coupé, elle attend le tic suivant. À chaque heure,
  // l'élagage passe aussi par les canvas écrits depuis le dernier : un canvas muet n'a rien à élaguer.
  const storeClosedMinutes = async (nowMs: Timestamp): Promise<void> => {
    for (let closed = closedMinutes[0]; closed; closed = closedMinutes[0]) {
      await deps.store.storeActivityMinute(closed);
      for (const canvasId of closed.canvases.keys()) writtenCanvasIds.add(canvasId);
      closedMinutes.shift();
    }
    const hourAt = toHourStart(nowMs);
    if (hourAt === prunedHourAt) return;
    await deps.store.pruneActivity(nowMs, writtenCanvasIds);
    writtenCanvasIds.clear();
    prunedHourAt = hourAt;
  };

  const run = async (): Promise<void> => {
    const nowMs = deps.now();
    rollMinute(nowMs);
    accrueVisitTime(nowMs);
    await storeClosedMinutes(nowMs);
    if (watchers.size === 0) return;
    const frames = await buildFrames(nowMs, new Set(watchers.values()));
    for (const [socket, canvasId] of watchers) {
      const frame = frames.get(canvasId);
      if (frame) socket.sendFrame(frame);
    }
  };

  return {
    join(page) {
      const nowMs = deps.now();
      rollMinute(nowMs);
      accrueVisitTime(nowMs);
      const opened: OpenPage = { ...page, connectedAt: nowMs, isCounted: isCounted(page.session?.userId) };
      pages.add(opened);
      tally(opened, 1, nowMs);
      countVisit(opened);
      return {
        setRole(role) {
          opened.role = role;
        },
        leave() {
          if (!pages.delete(opened)) return;
          const leftAt = deps.now();
          rollMinute(leftAt);
          accrueVisitTime(leftAt);
          tally(opened, -1, leftAt);
        },
      };
    },

    countPixels(canvasId, userId, pixels) {
      if (pixels === 0 || !isCounted(userId)) return;
      const nowMs = deps.now();
      rollMinute(nowMs);
      minute.playerIds.add(userId);
      minute.pixels += pixels;
      addTo(minute.pixelsByCanvas, canvasId, pixels);
      recentPixels.add(nowMs, pixels);
      canvasCounts.countPixels(canvasId, userId, pixels, nowMs);
    },

    watch(socket, session, isWatching, canvasId) {
      if (!isDeveloper(session?.userId)) return;
      if (isWatching) watchers.set(socket, canvasId);
      else watchers.delete(socket);
    },

    async listHistory(session, period, canvasId) {
      if (!isDeveloper(session?.userId)) return null;
      const nowMs = deps.now();
      const [points, canvasPoints] = await Promise.all([
        deps.store.listActivityHistory(period, nowMs),
        deps.store.listCanvasHistory(canvasId, period, nowMs),
      ]);
      return { points, canvasPoints };
    },

    // Un tic à la fois : deux écritures d'une même minute en doubleraient les pixels.
    async tick() {
      if (isTicking) return;
      isTicking = true;
      try {
        await run();
      } finally {
        isTicking = false;
      }
    },

    // Avant d'ouvrir le serveur : aucune page ni aucun pixel n'est encore arrivé.
    async start() {
      const nowMs = deps.now();
      const at = toMinuteStart(nowMs);
      pastMinutes = await deps.store.listCanvasPixels(at - HEAT_PAST_MINUTES * MINUTE_MS, at);
      await deps.store.pruneActivity(nowMs);
      prunedHourAt = toHourStart(nowMs);
    },
  };
}
