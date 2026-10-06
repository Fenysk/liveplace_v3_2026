// Les exemples de /design : des utilisateurs de démonstration, et rien d'autre. Aucune connexion, aucun store.

import { PALETTE } from "@liveplace/domain";
import type {
  AuthoredPixel,
  BannedUser,
  Moderator,
  Pixel,
  ReportedPlacement,
  ScoreboardEntry,
} from "@liveplace/domain/ports";
import type { ProfileUser } from "../design/profile";
import sampleAvatarUrl from "./sample-avatar.svg?url";

export const SAMPLE_OWNER: ProfileUser = {
  displayName: "Kalyss",
  login: "kalyss",
  avatarUrl: sampleAvatarUrl,
};
export const SAMPLE_VIEWER: ProfileUser = { displayName: "pixelmoth", login: "pixelmoth" };
// Une photo qui ne charge pas : l'initiale prend le relais.
export const SAMPLE_BROKEN_PHOTO: ProfileUser = {
  displayName: "Nuagelle",
  login: "nuagelle",
  avatarUrl: "/photo-introuvable.png",
};

// Qui regarde, dans les exemples du classement : un joueur qui n'est pas dans le top.
export const SAMPLE_PLAYER: ProfileUser = { displayName: "Chaton42", login: "chaton42" };

// Le top 5 des exemples : deux joueurs à égalité, une photo qui ne charge pas, un pseudo trop long pour l'étiquette.
export const SAMPLE_SCOREBOARD_TOP: readonly ScoreboardEntry[] = [
  { login: "kalyss", displayName: "Kalyss", avatarUrl: sampleAvatarUrl, pixels: 1204 },
  { login: "pixelmoth", displayName: "pixelmoth", pixels: 987 },
  { login: "nuagelle", displayName: "Nuagelle", avatarUrl: "/photo-introuvable.png", pixels: 640 },
  { login: "bourguitv", displayName: "BourguiTv", pixels: 640 },
  { login: "adventurouscastingfrmsqgc", displayName: "adventurouscastingfrmsqgc", pixels: 41 },
];

// Un clic sur /design ne fait rien : les exemples montrent un état, pas un comportement.
export const noop = (): void => undefined;

// Le canvas des exemples : la taille du jeu, sa palette.
export const SAMPLE_CANVAS = { width: 256, height: 256, palette: PALETTE };

// Un petit cœur rouge et un coup de gomme : l'aperçu le cadre de près.
const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
export const SAMPLE_DRAWING: readonly Pixel[] = [
  ...HEART.flatMap((row, y) =>
    [...row].flatMap((mark, x) => (mark === "X" ? [{ x: 120 + x, y: 80 + y, colorIndex: 5 }] : [])),
  ),
  { x: 128, y: 86, colorIndex: 0 },
];

// Les pixels d'un auteur, avec leur heure et leur pose (JOURNAL 2026-09-28) : le cœur est la pose inspectée, un
// sourire est posé 4 min avant, une ligne 40 min après. Le curseur de Retirer ses pixels les ajoute un à un.
export const SAMPLE_PLACEMENT_ID = "pheart001";
export const samplePlacements = (nowMs: number): readonly AuthoredPixel[] => [
  ...SAMPLE_DRAWING.map((pixel) => ({ ...pixel, placedAt: nowMs, placementId: SAMPLE_PLACEMENT_ID })),
  ...[0, 2, 4].map((dx) => ({
    x: 131 + dx,
    y: 81 + (dx === 2 ? 2 : 0),
    colorIndex: 9,
    placedAt: nowMs - 4 * 60_000,
    placementId: "psmile001",
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    x: 118 + index,
    y: 90,
    colorIndex: 28,
    placedAt: nowMs + 40 * 60_000,
    placementId: "pline0001",
  })),
];

// Deux poses signalées : l'une cachée du stream (le seuil est atteint), l'autre en attente.
export const sampleReports = (nowMs: number): readonly ReportedPlacement[] => [
  {
    userId: "3",
    login: "troll42",
    displayName: "Troll42",
    hasAccount: true,
    placementId: SAMPLE_PLACEMENT_ID,
    reportCount: 3,
    reportedAt: nowMs - 2 * 60_000,
    isOffStream: true,
    pixels: [...SAMPLE_DRAWING],
  },
  {
    userId: "2",
    login: "pixelmoth",
    displayName: "pixelmoth",
    hasAccount: true,
    placementId: "pline0001",
    reportCount: 1,
    reportedAt: nowMs - 30_000,
    isOffStream: false,
    pixels: SAMPLE_DRAWING.slice(0, 14).map((pixel) => ({ ...pixel, colorIndex: 28 })),
  },
];

// Des pixels d'un bout à l'autre du canvas : l'aperçu le montre en entier.
export const SAMPLE_SPREAD: readonly Pixel[] = Array.from({ length: 48 }, (_, index) => ({
  x: 8 + index * 5,
  y: 240 - index * 4,
  colorIndex: 28,
}));

// Un modérateur de chaque origine, un des deux, et un qui n'a pas encore de compte (JOURNAL 2026-09-27).
export const SAMPLE_MODERATORS: readonly Moderator[] = [
  {
    userId: "6",
    login: "kalyss",
    displayName: "Kalyss",
    avatarUrl: sampleAvatarUrl,
    isFromTwitch: true,
    isNamedHere: false,
    hasAccount: true,
  },
  {
    userId: "7",
    login: "pixelmoth",
    displayName: "pixelmoth",
    isFromTwitch: false,
    isNamedHere: true,
    hasAccount: true,
  },
  {
    userId: "9",
    login: "bourguitv",
    displayName: "BourguiTv",
    isFromTwitch: true,
    isNamedHere: true,
    hasAccount: true,
  },
  {
    userId: "8",
    login: "modo_du_chat",
    displayName: "Modo_du_chat",
    isFromTwitch: true,
    isNamedHere: false,
    hasAccount: false,
  },
];

export const SAMPLE_BANNED_USERS: readonly BannedUser[] = [
  {
    userId: "3",
    login: "troll42",
    displayName: "Troll42",
    pixelCount: SAMPLE_DRAWING.length,
    isFromTwitch: false,
    hasAccount: true,
  },
  {
    userId: "4",
    login: "spam_bot",
    displayName: "spam_bot",
    pixelCount: 412,
    isFromTwitch: true,
    hasAccount: true,
  },
  {
    userId: "10",
    login: "adventurouscastingfrmsqgc",
    displayName: "adventurouscastingfrmsqgc",
    pixelCount: 0,
    isFromTwitch: true,
    hasAccount: false,
  },
  {
    userId: "5",
    login: "sans_pixel",
    displayName: "sans_pixel",
    pixelCount: 0,
    isFromTwitch: true,
    hasAccount: false,
  },
];
