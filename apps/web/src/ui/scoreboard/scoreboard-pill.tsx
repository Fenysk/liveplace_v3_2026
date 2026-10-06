// La pill Classement (JOURNAL 2026-10-06), au centre à gauche, sur PC seulement : le top 5, et sa propre place en
// dessous, à part, quand on n'y est pas. Dépliée, chaque ligne montre l'avatar, le pseudo et les pixels ; le rang se
// lit à l'ordre et aux anneaux, et ne s'écrit que pour sa place à part. Repliée, la colonne se resserre en avatars,
// chacun avec son rang en indice, et le survol ou le focus donne son pseudo, son rang et ses pixels. Un clic n'y fait
// rien. L'affichage seul, nourri par `useScoreboardRows`.

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import type { ScoreboardRow, ScoreboardRows } from "../../state/scoreboard";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { Pill, type PillDock } from "../design/pill";
import { useShownWhileClosing } from "../design/window";
import { pixelCountLabel } from "../moderation/moderation-texts";
import { RankAvatar } from "./rank-avatar";
import { nextFocusIndex } from "./scoreboard-keys";
import {
  badgeRank,
  ordinalSuffix,
  pixelsNumber,
  rowLabel,
  TOGGLE_COLLAPSE,
  TOGGLE_EXPAND,
} from "./scoreboard-texts";
import { slideKeyProps, useSlideOnReorder } from "./slide-on-reorder";

const DOCK: PillDock = "cl";

export type ScoreboardPillProps = {
  rows: ScoreboardRows;
  isCollapsed: boolean;
  onToggle: () => void;
  isDocked?: boolean;
};

// Un seul avatar prend le Tab : les flèches mènent aux autres, et gardent le clavier pour la liste.
const moveFocus = (event: KeyboardEvent<HTMLButtonElement>): void => {
  const buttons = [...(event.currentTarget.closest("ol")?.querySelectorAll("button") ?? [])];
  const next = nextFocusIndex(event.key, buttons.indexOf(event.currentTarget), buttons.length);
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  buttons[next]?.focus();
};

type RankItemProps = { row: ScoreboardRow; isCollapsed: boolean; isFirst: boolean; isOutside: boolean };

const Ordinal = ({ rank }: { rank: number }) => (
  <>
    {rank}
    <sup className="lp-rank-sup">{ordinalSuffix(rank)}</sup>
  </>
);

// Déplié : le pseudo, le nombre de pixels, et le rang sous le pseudo pour sa place à part, où la position ne le dit plus.
const ExpandedRow = ({ row, isOutside }: { row: ScoreboardRow; isOutside: boolean }) => (
  <>
    <span className="lp-rank-text" aria-hidden="true">
      <span className="lp-rank-name lp-type-body">{row.player.displayName}</span>
      {isOutside && (
        <span className="lp-type-numeric lp-muted">
          <Ordinal rank={row.rank} />
        </span>
      )}
    </span>
    <span className="lp-rank-pixels lp-type-numeric lp-muted" aria-hidden="true">
      {pixelsNumber(row.pixels)}
    </span>
  </>
);

const RankItem = ({ row, isCollapsed, isFirst, isOutside }: RankItemProps) => {
  const { rank, pixels, player, isMe } = row;
  return (
    <li
      className={classNames("lp-rank", isMe && "is-me", isOutside && "lp-rank--outside")}
      aria-current={isMe ? "true" : undefined}
      {...slideKeyProps(player.login)}
    >
      <button
        type="button"
        className="lp-rank-main"
        aria-label={rowLabel(row)}
        tabIndex={isFirst ? 0 : -1}
        onKeyDown={moveFocus}
      >
        <RankAvatar player={player} rank={rank} />
        {isCollapsed ? (
          <span className="lp-rank-badge lp-type-kbd" aria-hidden="true">
            {badgeRank(rank)}
          </span>
        ) : (
          <ExpandedRow row={row} isOutside={isOutside} />
        )}
      </button>
      {isCollapsed && (
        <span className="lp-rank-tip" aria-hidden="true">
          <span className="lp-rank-tip-name lp-type-body">{player.displayName}</span>
          <span className="lp-rank-tip-meta lp-type-caption lp-muted">
            <Ordinal rank={rank} /> · {pixelCountLabel(pixels)}
          </span>
        </span>
      )}
    </li>
  );
};

export const ScoreboardPill = ({ rows, isCollapsed, onToggle, isDocked = true }: ScoreboardPillProps) => {
  const list = useRef<HTMLOListElement>(null);
  useSlideOnReorder(list, isCollapsed);
  const isVisible = rows.top.length > 0;
  // Elle garde son dernier classement pendant qu'elle s'efface : le seul joueur du top peut être banni.
  const shown = useShownWhileClosing(isVisible ? rows : null);
  if (!shown) return null;
  const items = shown.outside ? [...shown.top, shown.outside] : shown.top;
  return (
    <Pill dock={isDocked ? DOCK : undefined} layout="stack" isVisible={isVisible}>
      <ol ref={list} className="lp-scoreboard" aria-label="Classement" data-collapsed={isCollapsed}>
        {items.map((row, index) => (
          <RankItem
            key={row.player.login}
            row={row}
            isCollapsed={isCollapsed}
            isFirst={index === 0}
            isOutside={row === shown.outside}
          />
        ))}
      </ol>
      <Button
        icon={isCollapsed ? ChevronsUpDown : ChevronsDownUp}
        variant="ghost"
        title={isCollapsed ? TOGGLE_EXPAND : TOGGLE_COLLAPSE}
        isExpanded={!isCollapsed}
        onPress={onToggle}
      />
    </Pill>
  );
};
