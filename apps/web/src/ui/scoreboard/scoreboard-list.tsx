// La section Classement de la fenêtre (JOURNAL 2026-10-06), sur mobile : la même liste que la colonne, sans survol,
// donc le pseudo, le rang et les pixels de chacun sous les yeux. Sa propre place à part quand elle n'est pas dans le top.

import type { ScoreboardRow, ScoreboardRows } from "../../state/scoreboard";
import { classNames } from "../design/class-names";
import { pixelCountLabel } from "../moderation/moderation-texts";
import { RankAvatar } from "./rank-avatar";
import { ordinalSuffix, rowLabel } from "./scoreboard-texts";

type ScoreboardListProps = { rows: ScoreboardRows };

const ListRow = ({ row, isOutside }: { row: ScoreboardRow; isOutside: boolean }) => {
  const { rank, pixels, player, isMe } = row;
  return (
    <li
      className={classNames("lp-scoreboard-row", isMe && "is-me", isOutside && "lp-scoreboard-row--outside")}
      aria-current={isMe ? "true" : undefined}
    >
      {/* Lu d'un trait : l'avatar, le nom et le détail à l'écran, découpés, se liraient mal. */}
      <span className="lp-visually-hidden">{rowLabel(row)}</span>
      <span className="lp-scoreboard-avatar" aria-hidden="true">
        <RankAvatar player={player} rank={rank} />
      </span>
      <span className="lp-scoreboard-name lp-type-body" aria-hidden="true">
        {player.displayName}
      </span>
      <span className="lp-scoreboard-meta lp-type-caption lp-muted" aria-hidden="true">
        {rank}
        <sup className="lp-rank-sup">{ordinalSuffix(rank)}</sup> · {pixelCountLabel(pixels)}
      </span>
    </li>
  );
};

export const ScoreboardList = ({ rows }: ScoreboardListProps) => {
  const items = rows.outside ? [...rows.top, rows.outside] : rows.top;
  return (
    <ol className="lp-scoreboard-list" aria-label="Classement">
      {items.map((row) => (
        <ListRow key={row.player.login} row={row} isOutside={row === rows.outside} />
      ))}
    </ol>
  );
};
