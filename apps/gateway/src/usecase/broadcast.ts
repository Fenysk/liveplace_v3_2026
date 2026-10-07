// L'ensemble de diffusion d'un canvas et son tick (§6.2, §6.3).

import type { Timestamp } from "@liveplace/domain";
import type {
  CanvasCore,
  LiveControl,
  ScoreboardRank,
  TwitchLive,
  Unsubscribe,
} from "@liveplace/domain/ports";
import type { Event, ServerFrame } from "@liveplace/protocol";
import { conflate } from "./conflate";
import { type ScoreboardFrame, toScoreboardFrame } from "./scoreboard-frame";

// La frame telle qu'elle part : construite une fois par tick, le même objet pour chaque client du canvas.
export type CellsListener = (frame: Extract<ServerFrame, { t: "cells" }>) => void;
// JOURNAL 2026-10-06 : le classement, au plus une fois par fenêtre ; la frame est celle de cette page.
export type ScoreboardControl = { t: "scoreboard"; frame: ScoreboardFrame };
// Écart §4 (JOURNAL 2026-10-07) : le live d'un compte a changé ; chaque page décide s'il la regarde. Absent : plus en live.
export type TwitchLiveControl = { t: "twitchLive"; userId: string; twitchLive?: TwitchLive };
// Un message de contrôle de moderate.lua (§5.4), le classement ou un live : ni tick ni conflation, il n'a aucune case.
export type ControlMessage = LiveControl | ScoreboardControl | TwitchLiveControl;
export type ControlListener = (control: ControlMessage) => void;

export interface Broadcast {
  // `accountId` : le compte de la page, absent pour un invité et pour la vue OBS (JOURNAL 2026-09-28).
  join(
    canvasId: string,
    listener: CellsListener,
    onControl: ControlListener,
    accountId?: string,
  ): Promise<void>;
  leave(canvasId: string, listener: CellsListener): Promise<void>;
  tick(): void;
  // JOURNAL 2026-10-06 : une fenêtre du classement. Ne relit que les canvas où une pose, un ban ou un déban a eu lieu.
  tickScoreboard(): Promise<void>;
  countAccounts(canvasId: string): number; // un compte ouvert dans deux pages compte une fois
  // Écart §4 (JOURNAL 2026-10-07) : un message de contrôle à toutes les pages jointes, tous canvas confondus.
  announce(control: ControlMessage): void;
  // Écart §5.1 (JOURNAL 2026-10-07) : les pages et vues OBS jointes à un canvas, en tout et au plus gros canvas.
  countConnections(): { total: number; largestCanvas: number };
}

// Écart §5.1 et §6 (JOURNAL 2026-10-07) : la capacité mesure, à l'envoi de chaque frame, le retard de chaque pose qu'elle porte :
// sans l'attente voulue du tick. `tickMs` : l'intervalle du tick, celui de la minuterie qui l'appelle.
export type DelayRecorder = { now(): Timestamp; record(delayMs: number): void; tickMs: number };

type Member = { onControl: ControlListener; accountId: string | undefined };

type CanvasBroadcast = {
  listeners: Map<CellsListener, Member>;
  pendingEvents: Event[];
  pendingArrivals: Timestamp[]; // l'instant où chaque évènement du tampon est arrivé, dans le même ordre
  ticksWaited: number;
  subscription: Promise<Unsubscribe>;
  isScoreboardStale: boolean; // une pose, un ban ou un déban depuis la dernière lecture
  isReadingScoreboard: boolean;
  scoreboardTopKey: string; // le top tel qu'il est parti, pour ne le redire que s'il change
  scoreboardRankKeys: Map<string, string>; // la place de chaque compte qui en a une, telle qu'elle est partie
};

// D-13 : un canvas n'est vidé qu'un tick sur N, N = ⌈clients / 500⌉, au plus 3.
const CLIENTS_PER_TICK = 500;
const MAX_TICKS_BETWEEN_FRAMES = 3;
// JOURNAL 2026-10-06 : une page voit son classement à quelques secondes près, jamais à chaque pose.
export const SCOREBOARD_WINDOW_MS = 2500;

const ticksBetweenFrames = (clients: number): number =>
  Math.min(MAX_TICKS_BETWEEN_FRAMES, Math.max(1, Math.ceil(clients / CLIENTS_PER_TICK)));

// Un pixel posé change un score ; un ban ou un déban, qui y figure. Un retrait de pixels n'en change aucun.
const changesScoreboard = ({ kind, moderation }: Event): boolean =>
  kind === "place" || moderation?.action === "ban" || moderation?.action === "unban";

const rankKeyOf = ({ rank, pixels }: ScoreboardRank): string => `${rank}/${pixels}`;

type ScoreboardCore = Pick<CanvasCore, "listScoreboard" | "listScoreboardRanks">;

const accountIdsOf = (canvas: CanvasBroadcast | undefined): Set<string> => {
  const accountIds = new Set<string>();
  for (const { accountId } of canvas?.listeners.values() ?? []) if (accountId) accountIds.add(accountId);
  return accountIds;
};

// Une lecture du top et des places pour tout le canvas, jamais une par page : chaque page ne reçoit que ce qui a
// changé pour elle (le top, ou sa place).
const refreshScoreboard = async (core: ScoreboardCore, canvasId: string, canvas: CanvasBroadcast) => {
  const accountIds = accountIdsOf(canvas);
  const [top, ranks] = await Promise.all([
    core.listScoreboard(canvasId),
    core.listScoreboardRanks(canvasId, [...accountIds]),
  ]);
  const topKey = JSON.stringify(top);
  const isTopChanged = topKey !== canvas.scoreboardTopKey;
  const rankKeys = new Map([...ranks].map(([accountId, rank]) => [accountId, rankKeyOf(rank)]));
  const shared = toScoreboardFrame(top);
  for (const { onControl, accountId } of canvas.listeners.values()) {
    const rank = accountId ? ranks.get(accountId) : undefined;
    const isRankChanged =
      accountId !== undefined && rankKeys.get(accountId) !== canvas.scoreboardRankKeys.get(accountId);
    if (isTopChanged || isRankChanged)
      onControl({ t: "scoreboard", frame: rank ? toScoreboardFrame(top, rank) : shared });
  }
  canvas.scoreboardTopKey = topKey;
  canvas.scoreboardRankKeys = rankKeys;
};

export function createBroadcast(
  core: Pick<CanvasCore, "subscribe"> & ScoreboardCore,
  delays?: DelayRecorder,
): Broadcast {
  const canvases = new Map<string, CanvasBroadcast>();

  // Un évènement arrive dans le tampon du canvas, avec l'instant de son arrivée : le retard en retranche l'attente voulue.
  const enqueue = (canvas: CanvasBroadcast, event: Event): void => {
    canvas.pendingEvents.push(event);
    canvas.pendingArrivals.push(delays?.now() ?? 0);
    if (changesScoreboard(event)) canvas.isScoreboardStale = true;
  };

  const start = (canvasId: string): CanvasBroadcast => {
    const canvas: CanvasBroadcast = {
      listeners: new Map(),
      pendingEvents: [],
      pendingArrivals: [],
      ticksWaited: 0,
      subscription: core.subscribe(canvasId, (message) => {
        if ("e" in message) enqueue(canvas, message.e);
        else for (const { onControl } of canvas.listeners.values()) onControl(message.ctl);
      }),
      isScoreboardStale: false,
      isReadingScoreboard: false,
      scoreboardTopKey: "[]", // une page qui arrive sur un canvas sans pose n'a rien reçu : c'est son état de départ
      scoreboardRankKeys: new Map(),
    };
    canvases.set(canvasId, canvas);
    return canvas;
  };

  // Marqué lu avant la lecture : ce qui arrive pendant elle rouvre la fenêtre suivante. Un échec la rouvre aussi.
  const refresh = async (canvasId: string, canvas: CanvasBroadcast): Promise<void> => {
    canvas.isScoreboardStale = false;
    canvas.isReadingScoreboard = true;
    try {
      await refreshScoreboard(core, canvasId, canvas);
    } catch (error) {
      canvas.isScoreboardStale = true;
      console.error("gateway: classement non relu", canvasId, error);
    } finally {
      canvas.isReadingScoreboard = false;
    }
  };

  // L'heure prévue de ce tick : celle du précédent, plus l'intervalle, comme la minuterie de Node ; au premier tick, la sienne.
  let previousTickAt: Timestamp | undefined;
  const takeExpectedTickAt = (recorder: DelayRecorder): Timestamp => {
    const tickAt = recorder.now();
    const expectedAt = previousTickAt === undefined ? tickAt : previousTickAt + recorder.tickMs;
    previousTickAt = tickAt;
    return expectedAt;
  };

  // Le retard d'une pose partie dans une frame : l'envoi − `occurredAt` − l'attente voulue, de son arrivée à l'heure prévue du
  // tick qui l'envoie (un tick sauté en fait partie). Un seul nombre de plus en mémoire par pose, l'horloge lue une fois par frame.
  const recordDelays = (
    events: readonly Event[],
    arrivals: readonly Timestamp[],
    expectedAt: Timestamp,
    recorder: DelayRecorder,
  ): void => {
    const sentAt = recorder.now();
    events.forEach(({ kind, occurredAt }, index) => {
      if (kind !== "place") return;
      const arrivedAt = arrivals[index] ?? sentAt;
      recorder.record(sentAt - occurredAt - Math.max(0, expectedAt - arrivedAt));
    });
  };

  // La frame du canvas : ce que son tampon a reçu depuis son dernier envoi, conflaté, puis le retard de chaque pose.
  const flush = (canvas: CanvasBroadcast, expectedAt: Timestamp): void => {
    const { pendingEvents: events, pendingArrivals: arrivals } = canvas;
    canvas.pendingEvents = [];
    canvas.pendingArrivals = [];
    const conflated = conflate(events);
    if (!conflated) return;
    const frame = { t: "cells" as const, ...conflated };
    for (const listener of canvas.listeners.keys()) listener(frame);
    if (delays) recordDelays(events, arrivals, expectedAt, delays);
  };

  return {
    // S'abonner avant que l'appelant lise l'état : le pub/sub n'a aucune mémoire (§6.1).
    async join(canvasId, listener, onControl, accountId) {
      const canvas = canvases.get(canvasId) ?? start(canvasId);
      canvas.listeners.set(listener, { onControl, accountId });
      await canvas.subscription;
    },

    async leave(canvasId, listener) {
      const canvas = canvases.get(canvasId);
      if (!canvas) return;
      canvas.listeners.delete(listener);
      if (canvas.listeners.size > 0) return;
      // Retiré de la table avant l'attente : un client qui revient pendant le désabonnement repart sur un abonnement neuf.
      canvases.delete(canvasId);
      const unsubscribe = await canvas.subscription;
      await unsubscribe();
    },

    tick() {
      const expectedAt = delays ? takeExpectedTickAt(delays) : 0;
      for (const canvas of canvases.values()) {
        canvas.ticksWaited += 1;
        if (canvas.ticksWaited < ticksBetweenFrames(canvas.listeners.size)) continue;
        canvas.ticksWaited = 0;
        flush(canvas, expectedAt);
      }
    },

    async tickScoreboard() {
      const due = [...canvases].filter(
        ([, { isScoreboardStale, isReadingScoreboard }]) => isScoreboardStale && !isReadingScoreboard,
      );
      await Promise.all(due.map(([canvasId, canvas]) => refresh(canvasId, canvas)));
    },

    countAccounts(canvasId) {
      return accountIdsOf(canvases.get(canvasId)).size;
    },

    announce(control) {
      for (const { listeners } of canvases.values())
        for (const { onControl } of listeners.values()) onControl(control);
    },

    countConnections() {
      const sizes = [...canvases.values()].map(({ listeners }) => listeners.size);
      return { total: sizes.reduce((sum, size) => sum + size, 0), largestCanvas: Math.max(0, ...sizes) };
    },
  };
}
