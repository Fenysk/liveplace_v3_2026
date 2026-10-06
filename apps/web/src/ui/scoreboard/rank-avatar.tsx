// L'avatar d'une ligne du classement (JOURNAL 2026-10-06) : sa photo, dans l'anneau de sa place pour les trois premiers.

import type { ScoreboardPlayer } from "../../state/scoreboard";
import { classNames } from "../design/class-names";
import { Avatar } from "../design/profile";

const PODIUM_SIZE = 3;

type RankAvatarProps = { player: ScoreboardPlayer; rank: number };

export const RankAvatar = ({ player, rank }: RankAvatarProps) => (
  <span className={classNames("lp-rank-ring", rank <= PODIUM_SIZE && `lp-rank-ring--${rank}`)}>
    <Avatar displayName={player.displayName} avatarUrl={player.avatarUrl} />
  </span>
);
