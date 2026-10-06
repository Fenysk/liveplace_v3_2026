// Les mots du classement (JOURNAL 2026-10-06) : le rang à la française, jamais de « # », et les pixels au pluriel.

import type { ScoreboardRow } from "../../state/scoreboard";
import { pixelCountLabel } from "../moderation/moderation-texts";

export const TOGGLE_COLLAPSE = "Replier le classement";
export const TOGGLE_EXPAND = "Déplier le classement";

// À l'écran, le suffixe se met en exposant ; pour un lecteur d'écran, il reste collé au nombre.
export const ordinalSuffix = (rank: number): "er" | "e" => (rank === 1 ? "er" : "e");

// Déplié, le nombre seul : le mot « pixels » chargerait la ligne, et le nom accessible le dit.
export const pixelsNumber = (pixels: number): string => pixels.toLocaleString("fr-FR");

export const rankText = (rank: number): string => `${rank}${ordinalSuffix(rank)}`;

// Le nom d'une ligne : tout ce que l'écran montre au survol, dit d'un trait.
export const rowLabel = ({ rank, pixels, player }: ScoreboardRow): string =>
  `${rankText(rank)}, ${player.displayName}, ${pixelCountLabel(pixels)}`;

// La pastille d'un rang tient dans un petit rond : au-delà de 99, elle ne dit plus que « 99+ ».
export const badgeRank = (rank: number): string => (rank > 99 ? "99+" : String(rank));
