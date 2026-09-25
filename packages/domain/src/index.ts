// Règles pures du jeu et valeurs par défaut (§3.1).

export type Timestamp = number; // ms depuis epoch

export const ROLES = ["owner", "moderator", "viewer", "guest"] as const;
export type Role = (typeof ROLES)[number];

// Cookie `lp_session` vérifié (§10.2). Écart §10.2 (JOURNAL 2026-09-24) : la photo Twitch, quand il y en a une.
export type Session = { userId: string; login: string; displayName: string; avatarUrl?: string };

// Une personne, miroir de son compte Twitch (§8.1). `userId` = Twitch ID, immuable.
export type User = { userId: string; login: string; displayName: string; avatarUrl: string };

// Le cookie de session (§10.2) : signé par le web, vérifié par le gateway, défini ici une seule fois.
export const SESSION_COOKIE = "lp_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
export const SESSION_ALGORITHM = "HS256";

export type SessionClaims = { sub: string; login: string; displayName: string; avatarUrl?: string };

export function toSessionClaims(session: Session): SessionClaims {
  const { userId, login, displayName, avatarUrl } = session;
  return { sub: userId, login, displayName, ...(avatarUrl ? { avatarUrl } : {}) };
}

// Un claim absent ou illisible donne un invité, jamais une erreur (§10.2).
// Un cookie signé avant la photo n'en a pas : la session reste valide, sans elle.
export function toSession(claims: Record<string, unknown>): Session | null {
  const { sub, login, displayName, avatarUrl } = claims;
  if (typeof sub !== "string" || typeof login !== "string" || typeof displayName !== "string") return null;
  return { userId: sub, login, displayName, ...(typeof avatarUrl === "string" ? { avatarUrl } : {}) };
}

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

// Le gateway décide, le web affiche (§10.3) : la même règle des deux côtés.
export function canModerate(role: Role): boolean {
  return role === "owner" || role === "moderator";
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

// L'inverse de `toCellKey` : une cellKey lue dans Redis redevient une case.
export function toCell(cellKey: number): { x: number; y: number } {
  return { x: cellKey % CELL_STRIDE, y: Math.floor(cellKey / CELL_STRIDE) };
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

// Écart CDC v3 §1 (JOURNAL 2026-09-25) : le streamer règle le délai par crans, jusqu'à 10 min.
export const OBS_DELAY_STEPS_MS = [
  0, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000,
] as const;
export const OBS_DELAY_MS = 10_000;

export function isObsDelayStep(obsDelayMs: number): boolean {
  return OBS_DELAY_STEPS_MS.some((step) => step === obsDelayMs);
}

// Un canvas neuf aux valeurs par défaut du jeu (CDC §1) : aucune interface ne les change en bloc 1.
export function defaultCanvasMeta(ownerId: string): CanvasMeta {
  return {
    ownerId,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    gaugeMax: GAUGE_MAX,
    refillMs: REFILL_MS,
    refillCharges: REFILL_CHARGES,
    obsDelayMs: OBS_DELAY_MS,
  };
}

export type Palette = readonly string[];

export const TRANSPARENT_COLOR_INDEX = 0;

// L'ordre du CDC 2026, figé : un canvas stocke des index (JOURNAL 2026-09-24). Une couleur nouvelle s'ajoute à la fin.
export const PALETTE = [
  "#00000000",
  "#10121c",
  "#2c1e31",
  "#6b2643",
  "#ac2847",
  "#ec273f",
  "#94493a",
  "#de5d3a",
  "#e98537",
  "#f3a833",
  "#4d3533",
  "#6e4c30",
  "#a26d3f",
  "#ce9248",
  "#dab163",
  "#e8d282",
  "#f7f3b7",
  "#1e4044",
  "#006554",
  "#26854c",
  "#5ab552",
  "#9de64e",
  "#008b8b",
  "#62a477",
  "#a6cb96",
  "#d3eed3",
  "#3e3b65",
  "#3859b3",
  "#3388de",
  "#36c5f4",
  "#6dead6",
  "#5e5b8c",
  "#8c78a5",
  "#b0a7b8",
  "#deceed",
  "#9a4d76",
  "#c878af",
  "#cc99ff",
  "#fa6e79",
  "#ffa2ac",
  "#ffd1d5",
  "#f6e8e0",
  "#ffffff",
] as const satisfies Palette;
