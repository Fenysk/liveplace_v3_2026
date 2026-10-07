// La section Classement de la fenêtre (JOURNAL 2026-10-06), sur mobile : la même liste que la colonne, sans survol,
// donc le pseudo, le rang et les pixels de chacun sous les yeux. Sa propre place à part quand elle n'est pas dans le top.

import type { ScoreboardRow, ScoreboardRows } from "../../state/scoreboard";
import { classNames } from "../design/class-names";
import { useLocale, useTexts } from "../locale/use-locale";
import { MODERATION_TEXTS } from "../moderation/moderation-texts";
import { RankAvatar } from "./rank-avatar";
import { ordinalSuffix, rowLabel, SCOREBOARD_TEXTS } from "./scoreboard-texts";

type ScoreboardListProps = { rows: ScoreboardRows };

const ListRow = ({ row, isOutside }: { row: ScoreboardRow; isOutside: boolean }) => {
  const locale = useLocale();
  const moderation = useTexts(MODERATION_TEXTS);
  const { rank, pixels, player, isMe } = row;
  return (
    <li
      className={classNames("lp-scoreboard-row", isMe && "is-me", isOutside && "lp-scoreboard-row--outside")}
      aria-current={isMe ? "true" : undefined}
    >
      {/* Lu d'un trait : l'avatar, le nom et le détail à l'écran, découpés, se liraient mal. */}
      <span className="lp-visually-hidden">{rowLabel(row, locale)}</span>
      <span className="lp-scoreboard-avatar" aria-hidden="true">
        <RankAvatar player={player} rank={rank} />
      </span>
      <span className="lp-scoreboard-name lp-type-body" aria-hidden="true">
        {player.displayName}
      </span>
      <span className="lp-scoreboard-meta lp-type-caption lp-muted" aria-hidden="true">
        {rank}
        <sup className="lp-rank-sup">{ordinalSuffix(rank, locale)}</sup> · {moderation.pixelCount(pixels)}
      </span>
    </li>
  );
};

export const ScoreboardList = ({ rows }: ScoreboardListProps) => {
  const t = useTexts(SCOREBOARD_TEXTS);
  const items = rows.outside ? [...rows.top, rows.outside] : rows.top;
  return (
    <ol className="lp-scoreboard-list" aria-label={t.label}>
      {items.map((row) => (
        <ListRow key={row.player.login} row={row} isOutside={row === rows.outside} />
      ))}
    </ol>
  );
};
