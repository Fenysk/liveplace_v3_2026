// Ce que chaque canvas vit, minute par minute (JOURNAL 2026-10-07) : de quoi écrire ses points sans parcourir les pages, et
// dire à `here` ses pixels de la dernière minute et ce que sa minute en cours a déjà vu. Tout reste en mémoire : rien de
// lourd à une arrivée, un départ ni une pose.

import { type Device, MINUTE_MS, type Timestamp } from "@liveplace/domain";
import type { CanvasAudience, CanvasMinute } from "@liveplace/domain/ports";

const RECENT_SECONDS = 60;

export const addTo = (counts: Map<string, number>, key: string, delta: number): void => {
  const count = (counts.get(key) ?? 0) + delta;
  if (count > 0) counts.set(key, count);
  else counts.delete(key);
};

// Les pixels acceptés seconde par seconde : « la dernière minute » glisse avec l'horloge.
export const createRecentPixels = () => {
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

// Une page comptée : en jeu ou en vue OBS, avec son compte s'il y en a un.
export type CountedPage = { canvasId: string; mode: "ui" | "obs"; session: { userId: string } | null };

// Ce que la minute en cours d'un canvas a déjà vu, ajouté à l'audience gardée.
export type OpenCanvasMinute = Pick<CanvasAudience["today"], "visits" | "phoneVisits" | "visitMinutes"> & {
  playerIds: ReadonlySet<string>;
};

// Un canvas tel qu'il est ouvert maintenant, page par page. Le temps passé court par canvas : ses pages en jeu fois la durée
// écoulée, en millisecondes ; les minutes entières partent avec la minute qui se ferme, le reste attend la suivante.
type OpenCanvas = {
  accountPages: Map<string, number>; // `userId` → ses pages en jeu sur ce canvas
  guestPages: number;
  obsViews: number;
  uiPages: number;
  pendingVisitMs: number;
  accruedAt: Timestamp;
};

// La minute en cours d'un canvas : le pic de ses personnes et de ses vues OBS, 1 s'il a été vu streamé, ses visites, les
// comptes qui y ont posé.
type MinuteCounts = Omit<CanvasMinute, "pixels" | "playerIds"> & { playerIds: Set<string> };

const emptyMinute = (): MinuteCounts => ({
  people: 0,
  obsViews: 0,
  streamedMinutes: 0,
  visits: 0,
  phoneVisits: 0,
  visitMinutes: 0,
  playerIds: new Set(),
});

const toPeople = ({ accountPages, guestPages }: OpenCanvas): number => accountPages.size + guestPages;

export function createCanvasCounts() {
  const open = new Map<string, OpenCanvas>();
  const minute = new Map<string, MinuteCounts>();
  const recent = new Map<string, ReturnType<typeof createRecentPixels>>();

  const getMinute = (canvasId: string): MinuteCounts => {
    const known = minute.get(canvasId);
    if (known) return known;
    const created = emptyMinute();
    minute.set(canvasId, created);
    return created;
  };

  const getOpen = (canvasId: string, nowMs: Timestamp): OpenCanvas => {
    const known = open.get(canvasId);
    if (known) return known;
    const created: OpenCanvas = {
      accountPages: new Map(),
      guestPages: 0,
      obsViews: 0,
      uiPages: 0,
      pendingVisitMs: 0,
      accruedAt: nowMs,
    };
    open.set(canvasId, created);
    return created;
  };

  const accrue = (canvas: OpenCanvas, nowMs: Timestamp): void => {
    canvas.pendingVisitMs += canvas.uiPages * Math.max(0, nowMs - canvas.accruedAt);
    canvas.accruedAt = Math.max(canvas.accruedAt, nowMs);
  };

  const raisePeaks = (canvasId: string, canvas: OpenCanvas): void => {
    const counts = getMinute(canvasId);
    counts.people = Math.max(counts.people, toPeople(canvas));
    counts.obsViews = Math.max(counts.obsViews, canvas.obsViews);
  };

  // Le temps passé d'abord, aux pages d'avant : un départ ne rétroagit pas.
  const shift = ({ canvasId, mode, session }: CountedPage, delta: number, nowMs: Timestamp): void => {
    const canvas = getOpen(canvasId, nowMs);
    accrue(canvas, nowMs);
    if (mode === "obs") canvas.obsViews += delta;
    else {
      canvas.uiPages += delta;
      if (session) addTo(canvas.accountPages, session.userId, delta);
      else canvas.guestPages += delta;
    }
    if (delta > 0) raisePeaks(canvasId, canvas);
  };

  // Les minutes entières du temps passé, dues à la minute qui se ferme à `closedAt`.
  const closeVisitMinutes = (
    canvasId: string,
    canvas: OpenCanvas,
    closedAt: Timestamp,
    nextAt: Timestamp,
  ) => {
    accrue(canvas, closedAt);
    const visitMinutes = Math.floor(canvas.pendingVisitMs / MINUTE_MS);
    canvas.pendingVisitMs -= visitMinutes * MINUTE_MS;
    canvas.accruedAt = nextAt;
    if (visitMinutes > 0) getMinute(canvasId).visitMinutes = visitMinutes;
  };

  // La minute d'un canvas n'est écrite que s'il s'y est passé quelque chose : des personnes, une vue OBS, un stream, un pixel ou une visite.
  const closeMinute = (pixelsByCanvas: ReadonlyMap<string, number>): Map<string, CanvasMinute> => {
    const closed = new Map<string, CanvasMinute>();
    for (const [canvasId, counts] of minute) {
      const pixels = pixelsByCanvas.get(canvasId) ?? 0;
      const isActive =
        counts.people > 0 ||
        counts.obsViews > 0 ||
        counts.streamedMinutes > 0 ||
        counts.visits > 0 ||
        pixels > 0;
      if (isActive) closed.set(canvasId, { ...counts, pixels });
    }
    minute.clear();
    return closed;
  };

  // La minute suivante part du pic de ce qui est encore ouvert ; un canvas vide sans seconde en attente est oublié.
  const reopenMinute = (): void => {
    for (const [canvasId, canvas] of open) {
      if (toPeople(canvas) > 0 || canvas.obsViews > 0) raisePeaks(canvasId, canvas);
      else if (canvas.pendingVisitMs === 0) open.delete(canvasId);
    }
  };

  return {
    // Une page comptée s'ouvre : le pic de son canvas monte.
    join(page: CountedPage, nowMs: Timestamp): void {
      shift(page, 1, nowMs);
    },

    leave(page: CountedPage, nowMs: Timestamp): void {
      if (open.has(page.canvasId)) shift(page, -1, nowMs);
    },

    // Une visite : la page du jeu qui s'ouvre, jamais celle qui reprend ni la vue OBS.
    countVisit(canvasId: string, device: Device): void {
      const counts = getMinute(canvasId);
      counts.visits += 1;
      if (device === "phone") counts.phoneVisits += 1;
    },

    // Une lecture de cette minute l'a vu streamé (Écart §5.1, JOURNAL 2026-10-08) : sa minute vaut 1, et s'écrit.
    markStreamed(canvasId: string): void {
      getMinute(canvasId).streamedMinutes = 1;
    },

    countPixels(canvasId: string, userId: string, pixels: number, nowMs: Timestamp): void {
      getMinute(canvasId).playerIds.add(userId);
      const known = recent.get(canvasId) ?? createRecentPixels();
      recent.set(canvasId, known);
      known.add(nowMs, pixels);
    },

    getRecentPixels: (canvasId: string, nowMs: Timestamp): number => recent.get(canvasId)?.sum(nowMs) ?? 0,

    // Ce que la minute en cours de ce canvas a vu, son temps passé en minutes entières comprises.
    getOpenMinute(canvasId: string, nowMs: Timestamp): OpenCanvasMinute {
      const canvas = open.get(canvasId);
      if (canvas) accrue(canvas, nowMs);
      const counts = minute.get(canvasId);
      return {
        visits: counts?.visits ?? 0,
        phoneVisits: counts?.phoneVisits ?? 0,
        visitMinutes: Math.floor((canvas?.pendingVisitMs ?? 0) / MINUTE_MS),
        playerIds: counts?.playerIds ?? new Set(),
      };
    },

    // La minute se ferme à `closedAt` : on rend celle de chaque canvas où il s'est passé quelque chose, et la suivante
    // commence à `nextAt`. Les pixels glissants d'un canvas muet depuis une minute sont oubliés.
    roll(
      closedAt: Timestamp,
      nextAt: Timestamp,
      pixelsByCanvas: ReadonlyMap<string, number>,
    ): Map<string, CanvasMinute> {
      for (const [canvasId, canvas] of open) closeVisitMinutes(canvasId, canvas, closedAt, nextAt);
      const closed = closeMinute(pixelsByCanvas);
      reopenMinute();
      for (const [canvasId, pixels] of recent) if (pixels.sum(nextAt) === 0) recent.delete(canvasId);
      return closed;
    },
  };
}
