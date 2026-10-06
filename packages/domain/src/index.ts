// Règles pures du jeu et valeurs par défaut (§3.1).

export type Timestamp = number; // ms depuis epoch

export const ROLES = ["owner", "moderator", "viewer", "guest"] as const;
export type Role = (typeof ROLES)[number];

// Cookie `lp_session` vérifié (§10.2). §10.2 : la photo Twitch, quand il y en a une.
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

// CDC 2026, Signalement : 20 % des comptes connectés au canvas, arrondi au-dessus, au moins un.
// En entiers : 0,2 × 15 vaut 3,0000000000000004 en flottants, qu'un arrondi au-dessus porterait à 4.
const REPORT_PERCENT = 20;

export function reportThreshold(connectedAccounts: number): number {
  return Math.max(1, Math.ceil((connectedAccounts * REPORT_PERCENT) / 100));
}

// D-15 : deux index d'une même case, jamais interchangeables.
export type CellKey = number & { readonly __brand: "CellKey" };
export type StateOffset = number & { readonly __brand: "StateOffset" };

// La taille des canvas nés avant les formats (JOURNAL 2026-09-29) : ils la gardent, sans qu'on puisse y revenir.
export const CANVAS_WIDTH = 256;
export const CANVAS_HEIGHT = 256;
export const CELL_STRIDE = 65536;

export type CanvasSize = { width: number; height: number };

// CDC 2026 §1, Paramétrage : chaque format en trois tailles, Petit, Moyen, Grand. Aucun côté ne dépasse 256.
export const CANVAS_FORMATS = [
  { format: "1:1", sizes: [size(50, 50), size(100, 100), size(200, 200)] },
  { format: "16:9", sizes: [size(64, 36), size(128, 72), size(256, 144)] },
  { format: "9:16", sizes: [size(36, 64), size(72, 128), size(144, 256)] },
  { format: "4:3", sizes: [size(60, 45), size(120, 90), size(240, 180)] },
  { format: "3:4", sizes: [size(45, 60), size(90, 120), size(180, 240)] },
] as const;

export type CanvasFormat = (typeof CANVAS_FORMATS)[number]["format"];

function size(width: number, height: number): CanvasSize {
  return { width, height };
}

// CDC 2026 §1 : un nouveau canvas naît en 50×50, le petit carré.
export const BIRTH_CANVAS_SIZE: CanvasSize = size(50, 50);

export function isCanvasSize({ width, height }: CanvasSize): boolean {
  return CANVAS_FORMATS.some(({ sizes }) =>
    sizes.some((each) => each.width === width && each.height === height),
  );
}

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

// §5.1 : la jauge max de chaque joueur se calcule entre ces deux réglages du streamer.
export type GaugeLimits = { gaugeMaxStart: number; gaugeMaxCeiling: number };

// `cv:<id>:meta` sans `ready` (§5.1).
export type CanvasMeta = Omit<GaugeParams, "gaugeMax"> &
  GaugeLimits & {
    ownerId: string;
    width: number;
    height: number;
    obsDelayMs: number;
    obsBackground: ObsBackground;
  };

// CDC 2026 §1 : le fond de la vue OBS. Transparent par défaut, et sur un canvas d'avant.
export const OBS_BACKGROUNDS = ["transparent", "white"] as const;
export type ObsBackground = (typeof OBS_BACKGROUNDS)[number];
export const OBS_BACKGROUND: ObsBackground = "transparent";

export const GAUGE_MAX_START = 10;
export const GAUGE_MAX_CEILING = 150;
export const GAUGE_MAX_START_BOUNDS = { min: 1, max: 50 } as const;
export const GAUGE_MAX_CEILING_BOUND = 500; // le plafond va du départ jusqu'ici
export const GAUGE_GROWTH_FACTOR = 0.3; // le premier +1 au 12e pixel
export const COUNTED_PIXELS_PER_DAY = 600;
export const REFILL_MS = 10_000;
export const REFILL_CHARGES = 1;

// JOURNAL 2026-10-06 : le `scoreboard` montre les cinq premiers joueurs du canvas.
export const SCOREBOARD_SIZE = 5;

// §5.3 : `max(0, …)`, une horloge qui recule ne vide pas la jauge.
export function refillGauge(gauge: Gauge | undefined, nowMs: Timestamp, params: GaugeParams): Gauge {
  if (!gauge) return { charges: params.gaugeMax, at: nowMs };
  const refills = Math.max(0, Math.floor((nowMs - gauge.at) / params.refillMs));
  const charges = Math.min(params.gaugeMax, gauge.charges + refills * params.refillCharges);
  // §5.3 : pleine, elle n'avance plus ; la recharge repart de la première charge dépensée.
  return { charges, at: charges >= params.gaugeMax ? nowMs : gauge.at + refills * params.refillMs };
}

// La progression d'un joueur sur un canvas, sans le jour (§5.1, JOURNAL 2026-09-30).
export type Progress = { countedPixels: number; claimed: number };

export function isGaugeLimits({ gaugeMaxStart, gaugeMaxCeiling }: GaugeLimits): boolean {
  return (
    Number.isInteger(gaugeMaxStart) &&
    Number.isInteger(gaugeMaxCeiling) &&
    gaugeMaxStart >= GAUGE_MAX_START_BOUNDS.min &&
    gaugeMaxStart <= GAUGE_MAX_START_BOUNDS.max &&
    gaugeMaxCeiling >= gaugeMaxStart &&
    gaugeMaxCeiling <= GAUGE_MAX_CEILING_BOUND
  );
}

// La formule de gauge.lua : un plafond baissé rabote, mais ne reprend rien de ce qui a été réclamé.
export function playerGaugeMax(claimed: number, limits: GaugeLimits): number {
  return Math.min(limits.gaugeMaxStart + claimed, limits.gaugeMaxCeiling);
}

export function earnedRewards(countedPixels: number): number {
  return Math.floor(GAUGE_GROWTH_FACTOR * Math.sqrt(countedPixels));
}

// A3 (JOURNAL 2026-09-30) : le jour de Paris, `2026-10-05`. Un stream du soir ne change pas de jour en plein milieu.
const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toParisDay(nowMs: Timestamp): string {
  return PARIS_DAY.format(nowMs);
}

// Ce que le plafond laisse encore réclamer, parmi les récompenses gagnées.
export function claimableRewards({ countedPixels, claimed }: Progress, limits: GaugeLimits): number {
  const room = limits.gaugeMaxCeiling - limits.gaugeMaxStart - claimed;
  return Math.max(0, Math.min(earnedRewards(countedPixels) - claimed, room));
}

// CDC 2026 §1 : le streamer règle le délai par crans, jusqu'à 10 min.
export const OBS_DELAY_STEPS_MS = [
  0, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 600_000,
] as const;
export const OBS_DELAY_MS = 10_000;

export function isObsDelayStep(obsDelayMs: number): boolean {
  return OBS_DELAY_STEPS_MS.some((step) => step === obsDelayMs);
}

// Un canvas neuf aux valeurs par défaut du jeu (CDC §1). Seuls sa taille et le délai OBS changent ensuite.
export function defaultCanvasMeta(ownerId: string): CanvasMeta {
  return {
    ownerId,
    ...BIRTH_CANVAS_SIZE,
    gaugeMaxStart: GAUGE_MAX_START,
    gaugeMaxCeiling: GAUGE_MAX_CEILING,
    refillMs: REFILL_MS,
    refillCharges: REFILL_CHARGES,
    obsDelayMs: OBS_DELAY_MS,
    obsBackground: OBS_BACKGROUND,
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
