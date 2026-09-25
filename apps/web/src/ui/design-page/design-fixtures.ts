// Les exemples de /design : des utilisateurs de démonstration, et rien d'autre. Aucune connexion, aucun store.

import { PALETTE } from "@liveplace/domain";
import type { BannedUser, Pixel } from "@liveplace/domain/ports";
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

// Des pixels d'un bout à l'autre du canvas : l'aperçu le montre en entier.
export const SAMPLE_SPREAD: readonly Pixel[] = Array.from({ length: 48 }, (_, index) => ({
  x: 8 + index * 5,
  y: 240 - index * 4,
  colorIndex: 28,
}));

export const SAMPLE_BANNED_USERS: readonly BannedUser[] = [
  { userId: "3", login: "troll42", displayName: "Troll42", pixelCount: SAMPLE_DRAWING.length },
  { userId: "4", login: "spam_bot", displayName: "spam_bot", pixelCount: 412 },
  { userId: "5", login: "sans_pixel", displayName: "sans_pixel", pixelCount: 0 },
];
