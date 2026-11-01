// Le classement d'un canvas en frame (§5.9) : le top, et la place de qui la reçoit.

import type { ScoreboardEntry, ScoreboardRank } from "@liveplace/domain/ports";
import type { ServerFrame } from "@liveplace/protocol";

export type ScoreboardFrame = Extract<ServerFrame, { t: "scoreboard" }>;

export const toScoreboardFrame = (top: ScoreboardEntry[], rank?: ScoreboardRank): ScoreboardFrame => ({
  t: "scoreboard",
  top,
  ...(rank ? { you: rank } : {}),
});
