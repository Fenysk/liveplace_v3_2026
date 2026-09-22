// Règles pures du jeu et valeurs par défaut (§3.1).

export type Timestamp = number; // ms depuis epoch

export const ROLES = ["owner", "moderator", "viewer", "guest"] as const;
export type Role = (typeof ROLES)[number];

// Cookie `lp_session` vérifié (§10.2).
export type Session = { userId: string; login: string; displayName: string };

// Une personne, miroir de son compte Twitch (§8.1). `userId` = Twitch ID, immuable.
export type User = { userId: string; login: string; displayName: string; avatarUrl: string };

// §10.3
export function roleFor(
  session: Session | null,
  meta: Pick<CanvasMeta, "ownerId">,
  isModerator: boolean,
): Role {
  if (!session) return "guest";
  if (session.userId === meta.ownerId) return "owner";
  if (isModerator) return "moderator";
  return "viewer";
}

// D-15 : deux index d'une même case, jamais interchangeables.
export type CellKey = number & { readonly __brand: "CellKey" };
export type StateOffset = number & { readonly __brand: "StateOffset" };

export const CANVAS_WIDTH = 256;
export const CANVAS_HEIGHT = 256;
export const CELL_STRIDE = 65536;

export function toStateOffset(x: number, y: number, width: number): StateOffset {
  return (y * width + x) as StateOffset;
}

export function toCellKey(x: number, y: number): CellKey {
  return (y * CELL_STRIDE + x) as CellKey;
}

// Jauge stockée (§5.1), pas la frame `gauge`.
export type Gauge = { charges: number; at: Timestamp };
export type GaugeParams = { gaugeMax: number; refillMs: number; refillCharges: number };

// `cv:<id>:meta` sans `ready` (§5.1).
export type CanvasMeta = GaugeParams & { ownerId: string; width: number; height: number; obsDelayMs: number };

export const GAUGE_MAX = 10;
export const REFILL_MS = 10_000;
export const REFILL_CHARGES = 1;

// Écart §5.3 (JOURNAL 2026-09-15) : `max(0, …)`, une horloge qui recule ne vide pas la jauge.
export function refillGauge(gauge: Gauge | undefined, nowMs: Timestamp, params: GaugeParams): Gauge {
  if (!gauge) return { charges: params.gaugeMax, at: nowMs };
  const refills = Math.max(0, Math.floor((nowMs - gauge.at) / params.refillMs));
  return {
    charges: Math.min(params.gaugeMax, gauge.charges + refills * params.refillCharges),
    at: gauge.at + refills * params.refillMs,
  };
}

export const OBS_DELAY_MS = 5000;

export type Palette = readonly string[];

export const TRANSPARENT_COLOR_INDEX = 0;

// Provisoire, à affiner après le J10.
export const PALETTE = [
  "#00000000",
  "#10121c",
  "#b0a7b8",
  "#ffffff",
  "#6e4c30",
  "#ce9248",
  "#ac2847",
  "#ec273f",
  "#e98537",
  "#f3a833",
  "#26854c",
  "#9de64e",
  "#008b8b",
  "#3859b3",
  "#36c5f4",
  "#8c78a5",
  "#fa6e79",
] as const satisfies Palette;
