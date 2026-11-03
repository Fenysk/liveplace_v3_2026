// Les vignettes des Nouveautés (112 × 72) : de vrais éléments de LivePlace en petit, sur le fond pointillé des fresques. Les dessins
// sont en SVG (tracés et attributs, jamais `style` : le HTML du serveur n'en porte aucun, la CSP de production le bloquerait) ;
// le podium est celui du classement, les pills de la Modération et du Dessin sont celles du jeu (leurs fichiers à part).
// Tout se dimensionne en `--lp-u` (1 px, ou plus en grand) : la vignette agrandie reste nette. Les six animations ne tournent
// qu'à l'écran et restent sur leur image fixe avec `prefers-reduced-motion: reduce`.

import { PALETTE } from "@liveplace/domain";
import { type ComponentType, useRef } from "react";
import { Avatar } from "../design/profile";
import { useLocale } from "../locale/use-locale";
import { ordinalSuffix } from "../scoreboard/scoreboard-texts";
import { ArchivesThumbnail } from "./archive-thumbnail";
import { BackgroundsThumbnail } from "./background-thumbnail";
import { EyedropperThumbnail } from "./eyedropper-thumbnail";
import { FormatThumbnail } from "./format-thumbnail";
import { GaugeThumbnail } from "./gauge-thumbnail";
import { HelpThumbnail } from "./help-thumbnail";
import { ClearThumbnail, ReportThumbnail } from "./inspection-thumbnails";
import { InstallThumbnail } from "./install-thumbnail";
import { KeyboardThumbnail } from "./keyboard-thumbnail";
import { LaunchThumbnail } from "./launch-thumbnail";
import { LiveThumbnail } from "./live-thumbnail";
import { LocaleThumbnail } from "./locale-thumbnail";
import { ModerationThumbnail } from "./moderation-thumbnail";
import type { ReleaseThumbnail } from "./release-notes";
import { ThemeThumbnail } from "./theme-thumbnail";
import { SHOT_HEIGHT, SHOT_WIDTH, VIEW_BOX } from "./thumbnail-layers";
import {
  GROWTH_CELLS,
  GROWTH_HEIGHT,
  GROWTH_WIDTH,
  growthAt,
  podiumAt,
  RESTING_MS,
} from "./thumbnail-motion";
import { UndoThumbnail } from "./undo-thumbnail";
import { useVisibleLoop } from "./use-visible-loop";

// « La fresque grandit seule » : des traits se posent, la fresque s'agrandit en glissant. Elle part d'ici, au centre de la vignette.
const GROWTH_CELL = 3;
const GROWTH_LEFT = (SHOT_WIDTH - GROWTH_WIDTH * GROWTH_CELL) / 2;
const GROWTH_TOP = (SHOT_HEIGHT - GROWTH_HEIGHT * GROWTH_CELL) / 2;
const SHADOW_OFFSET = { x: 1, y: 2 } as const;

const rectOf = ([x0, y0, x1, y1]: readonly [number, number, number, number], offsetX = 0, offsetY = 0) => ({
  x: GROWTH_LEFT + x0 * GROWTH_CELL + offsetX,
  y: GROWTH_TOP + y0 * GROWTH_CELL + offsetY,
  width: (x1 - x0) * GROWTH_CELL,
  height: (y1 - y0) * GROWTH_CELL,
});

const setRect = (rect: Element | null, values: ReturnType<typeof rectOf>): void => {
  if (!rect) return;
  for (const [name, value] of Object.entries(values)) rect.setAttribute(name, String(value));
};

// Le dessin de chaque image : le cadre et son ombre se déplacent, et chaque case se montre ou se cache.
const renderGrowth = (svg: SVGSVGElement, timeMs: number): void => {
  const { bounds, shown } = growthAt(timeMs);
  setRect(svg.querySelector('[data-part="shadow"]'), rectOf(bounds, SHADOW_OFFSET.x, SHADOW_OFFSET.y));
  setRect(svg.querySelector('[data-part="canvas"]'), rectOf(bounds));
  for (const cell of svg.querySelectorAll<SVGRectElement>("[data-motif]")) {
    const isShown = Number(cell.dataset.cell) < (shown[Number(cell.dataset.motif)] ?? 0);
    cell.setAttribute("visibility", isShown ? "visible" : "hidden");
  }
};

const GrowthThumbnail = () => {
  const svg = useRef<SVGSVGElement>(null);
  useVisibleLoop(svg, renderGrowth, RESTING_MS);
  const { bounds } = growthAt(RESTING_MS);
  return (
    <svg
      ref={svg}
      className="lp-release-svg"
      viewBox={VIEW_BOX}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect
        className="lp-release-shadow"
        data-part="shadow"
        {...rectOf(bounds, SHADOW_OFFSET.x, SHADOW_OFFSET.y)}
      />
      <rect className="lp-release-paper" data-part="canvas" {...rectOf(bounds)} />
      {GROWTH_CELLS.map(({ id, motif, order, x, y, colorIndex }) => (
        <rect
          key={id}
          data-motif={motif}
          data-cell={order}
          x={GROWTH_LEFT + x * GROWTH_CELL}
          y={GROWTH_TOP + y * GROWTH_CELL}
          width={GROWTH_CELL}
          height={GROWTH_CELL}
          fill={PALETTE[colorIndex]}
        />
      ))}
    </svg>
  );
};

// « Le classement » : le podium de la colonne dépliée, avec ses vrais anneaux, le numéro de la place et le pseudo. Toutes les 1,6 s,
// un autre passe premier : l'anneau et le pseudo glissent (`--lp-slot`, en places) et l'anneau prend la couleur de sa place ; le
// numéro reste celui de la place, 1, 2, 3 de haut en bas. Des pseudos inventés, dont l'initiale est celle de l'anneau.
const PODIUM_PLAYERS = ["Ana", "Nox", "Kira"] as const;
const PLACES = [1, 2, 3] as const;

const ringClass = (rank: number): string => `lp-rank-ring lp-rank-ring--${rank + 1}`;

const renderPodium = (podium: HTMLElement, timeMs: number): void => {
  const { slots, ranks } = podiumAt(timeMs);
  for (const row of podium.querySelectorAll<HTMLElement>("[data-avatar]")) {
    const avatar = Number(row.dataset.avatar);
    row.style.setProperty("--lp-slot", String(slots[avatar] ?? avatar));
    if (row.firstElementChild) row.firstElementChild.className = ringClass(ranks[avatar] ?? avatar);
  }
};

const PodiumThumbnail = () => {
  const locale = useLocale();
  const podium = useRef<HTMLSpanElement>(null);
  useVisibleLoop(podium, renderPodium, RESTING_MS);
  const { slots, ranks } = podiumAt(RESTING_MS);
  return (
    <span ref={podium} className="lp-pill lp-release-podium">
      <span className="lp-pill-content">
        <span className="lp-release-ranks">
          {PLACES.map((place) => (
            <span
              key={place}
              className={`lp-release-number lp-release-slot--${place - 1} lp-type-numeric lp-muted`}
            >
              {place}
              <sup className="lp-rank-sup">{ordinalSuffix(place, locale)}</sup>
            </span>
          ))}
          {PODIUM_PLAYERS.map((name, avatar) => (
            <span
              key={name}
              className={`lp-release-rank lp-release-slot--${slots[avatar]}`}
              data-avatar={avatar}
            >
              <span className={ringClass(ranks[avatar] ?? avatar)}>
                <Avatar displayName={name} />
              </span>
              <span className="lp-rank-name lp-type-body">{name}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
};

export const THUMBNAILS = {
  archives: ArchivesThumbnail,
  backgrounds: BackgroundsThumbnail,
  growth: GrowthThumbnail,
  scoreboard: PodiumThumbnail,
  moderation: ModerationThumbnail,
  undo: UndoThumbnail,
  report: ReportThumbnail,
  clear: ClearThumbnail,
  eyedropper: EyedropperThumbnail,
  keyboard: KeyboardThumbnail,
  gauge: GaugeThumbnail,
  format: FormatThumbnail,
  launch: LaunchThumbnail,
  help: HelpThumbnail,
  language: LocaleThumbnail,
  install: InstallThumbnail,
  live: LiveThumbnail,
  theme: ThemeThumbnail,
} as const satisfies Record<ReleaseThumbnail, ComponentType>;
