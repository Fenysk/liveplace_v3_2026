// Le suivi d'activité vu du gateway (écart §4.3 et §5.1, JOURNAL 2026-10-06 et 2026-10-07) : qui est connecté, où, depuis
// quand, les pixels acceptés, et l'audience : visites, temps passé, comptes, joueurs et streamers. La liste des connexions
// reste en mémoire ; Redis ne garde que des nombres.

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
  ActivityPoint,
  ActivityStore,
  ActivityUser,
  CanvasCore,
  CanvasPixelsMinute,
  ClientSocket,
  ConnectedAccount,
  DaySignups,
} from "@liveplace/domain/ports";

// §3 du cahier des charges : la frame part toutes les 2 s, tant que le développeur regarde.
export const ACTIVITY_TICK_MS = 2000;
// La température : la minute en cours et les 59 d'avant.
const HEAT_PAST_MINUTES = 59;
const RECENT_SECONDS = 60;
const OWNER_CACHE_MS = 10 * MINUTE_MS; // le nom ou la photo d'un streamer peut changer à sa prochaine connexion

export type ActivityDeps = {
  store: ActivityStore;
  core: Pick<CanvasCore, "getCanvas">; // le streamer d'un canvas où il ne reste que des pixels récents
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
  watch(socket: ClientSocket, session: Session | null, isWatching: boolean): void; // ignoré hors du développeur
  listHistory(session: Session | null, period: ActivityPeriod): Promise<ActivityPoint[] | null>; // `null` : refusé
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

const addTo = (counts: Map<string, number>, key: string, delta: number): void => {
  const count = (counts.get(key) ?? 0) + delta;
  if (count > 0) counts.set(key, count);
  else counts.delete(key);
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

// Les pixels acceptés seconde par seconde : « la dernière minute » glisse avec l'horloge.
const createRecentPixels = () => {
  const seconds = Array.from({ length: RECENT_SECONDS }, () => ({ second: -1, pixels: 0 }));
  return {
    add(nowMs: Timestamp, pixels: number): void {
      const second = Math.floor(nowMs / 1000);
      const slot = seconds[second % RECENT_SECONDS];
      if (!slot) return;
      if (slot.second !== second) Object.assign(slot, { second, pixels: 0 });
      slot.pixels += pixels;
    },
    sum(nowMs: Timestamp): number {
      const second = Math.floor(nowMs / 1000);
      return seconds.reduce(
        (sum, slot) => (slot.second > second - RECENT_SECONDS ? sum + slot.pixels : sum),
        0,
      );
    },
  };
};

export function createActivity(deps: ActivityDeps): Activity {
  const pages = new Set<OpenPage>();
  const watchers = new Set<ClientSocket>();
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
    closedMinutes.push(minute);
    pastMinutes = [...pastMinutes, { at: minute.at, pixelsByCanvas: minute.pixelsByCanvas }].filter(
      (past) => past.at >= at - HEAT_PAST_MINUTES * MINUTE_MS,
    );
    minute = openMinute(at);
    accruedAt = at;
  };

  const tally = (page: OpenPage, delta: number): void => {
    if (!page.isCounted) return;
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

  // Une visite : la page du jeu qui s'ouvre, jamais celle qui reprend ni la vue OBS ; le compte compte pour la minute.
  const countVisit = (page: OpenPage): void => {
    if (!page.isCounted || page.mode !== "ui" || page.isResumed) return;
    minute.visits += 1;
    if (page.device === "phone") minute.phoneVisits += 1;
    if (page.session) minute.accountIds.add(page.session.userId);
  };

  // Les sommes de la minute en cours s'ajoutent à l'audience gardée ; ses identifiants sont déjà dans la lecture.
  const addOpenMinute = (
    { visits, phoneVisits, visitMinutes, ...distinct }: ActivityAudience["today"],
    open: Pick<OpenMinute, "visits" | "phoneVisits" | "visitMinutes">,
  ): ActivityAudience["today"] => ({
    ...distinct,
    visits: visits + open.visits,
    phoneVisits: phoneVisits + open.phoneVisits,
    visitMinutes: visitMinutes + open.visitMinutes,
  });

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

  const toCanvas = async (
    { canvasId, ownerId, obsViews, guests, countedUserIds, accounts }: CanvasTally,
    heat: number,
    signups: DaySignups,
    nowMs: Timestamp,
  ): Promise<ActivityCanvas> => ({
    canvasId,
    owner: await getOwner(ownerId, nowMs),
    obsViews,
    people: countedUserIds.size + guests,
    guests,
    heat,
    signups: signups.byDiscoveredViaUserId.get(ownerId) ?? 0,
    accounts: [...accounts.values()].sort((left, right) => left.connectedAt - right.connectedAt),
  });

  // Les canvas chauds sans personne dessus : leur streamer se lit dans `meta`, une fois.
  const addHotCanvases = async (canvases: Map<string, CanvasTally>, heat: Map<string, number>) => {
    for (const canvasId of heat.keys()) {
      if (canvases.has(canvasId)) continue;
      const ownerId = await getOwnerId(canvasId);
      if (ownerId) canvases.set(canvasId, emptyTally(canvasId, ownerId));
    }
  };

  // Construite une fois par envoi, le même objet pour chaque socket qui regarde.
  const buildFrame = async (nowMs: Timestamp): Promise<ActivityFrame> => {
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
    const shown = await Promise.all(
      [...canvases.values()].map((canvas) =>
        toCanvas(canvas, heat.get(canvas.canvasId) ?? 0, signups, nowMs),
      ),
    );
    return {
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
  };

  // Une minute n'est retirée de la file qu'une fois écrite : Redis coupé, elle attend le tic suivant.
  const storeClosedMinutes = async (nowMs: Timestamp): Promise<void> => {
    for (let closed = closedMinutes[0]; closed; closed = closedMinutes[0]) {
      await deps.store.storeActivityMinute(closed);
      closedMinutes.shift();
    }
    const hourAt = toHourStart(nowMs);
    if (hourAt === prunedHourAt) return;
    await deps.store.pruneActivity(nowMs);
    prunedHourAt = hourAt;
  };

  const run = async (): Promise<void> => {
    const nowMs = deps.now();
    rollMinute(nowMs);
    accrueVisitTime(nowMs);
    await storeClosedMinutes(nowMs);
    if (watchers.size === 0) return;
    const frame = await buildFrame(nowMs);
    for (const socket of watchers) socket.sendFrame(frame);
  };

  return {
    join(page) {
      const nowMs = deps.now();
      rollMinute(nowMs);
      accrueVisitTime(nowMs);
      const opened: OpenPage = { ...page, connectedAt: nowMs, isCounted: isCounted(page.session?.userId) };
      pages.add(opened);
      tally(opened, 1);
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
          tally(opened, -1);
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
    },

    watch(socket, session, isWatching) {
      if (!isDeveloper(session?.userId)) return;
      if (isWatching) watchers.add(socket);
      else watchers.delete(socket);
    },

    async listHistory(session, period) {
      if (!isDeveloper(session?.userId)) return null;
      return deps.store.listActivityHistory(period, deps.now());
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
