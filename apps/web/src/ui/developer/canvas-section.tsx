// La section Ce canvas de la fenêtre Développeur (cahier des charges du suivi d'activité, §3 ; JOURNAL 2026-10-07) : le canvas
// de la socket, ou son archive. En tête son streamer, puis les chiffres de l'instant, l'audience, qui est là, et l'historique.
// L'affichage seul : `LiveActivitySection` la branche sur le store. Le web affiche, le gateway décide.

import type { ActivityPeriod, Timestamp } from "@liveplace/domain";
import type { ActivityHere } from "@liveplace/domain/ports";
import type { ActivityWatchView } from "../../state/activity-watch";
import { CanvasActivityOwner, ConnectedAccounts } from "../design/canvas-activity-card";
import { StatTable } from "../design/stat-table";
import { StatTile, StatTiles } from "../design/stat-tile";
import {
  AUDIENCE_COLUMNS,
  formatCount,
  guestsNote,
  toActivityAccounts,
  toCanvasAudienceRows,
  toGuestsLine,
} from "./activity-labels";
import { canvasChartLinesFor, toCanvasSlots } from "./activity-slots";
import { HistoryBlock, LOADING, type ShownChart, type ShownHistory } from "./history-block";

export type CanvasSectionProps = {
  view: ActivityWatchView;
  nowMs: Timestamp; // « depuis 12 min »
  onSelectPeriod: (period: ActivityPeriod) => void;
};

const NowBlock = ({ here }: { here: ActivityHere }) => (
  <StatTiles>
    <StatTile label="Personnes connectées" value={formatCount(here.people)} note={guestsNote(here.guests)} />
    <StatTile label="Vues OBS ouvertes" value={formatCount(here.obsViews)} />
    <StatTile label="Pixels de la dernière minute" value={formatCount(here.pixels)} />
    <StatTile label="Température" value={formatCount(here.heat)} note="px/h" />
  </StatTiles>
);

// Sans `canvasPoints`, le gateway est d'avant : l'historique d'un canvas n'existe pas encore.
const toChart = ({ canvasPoints, period }: ShownHistory): ShownChart | null =>
  canvasPoints
    ? { lines: canvasChartLinesFor(period), slots: toCanvasSlots(canvasPoints, period, Date.now()) }
    : null;

const HereBlocks = ({ here, view, nowMs, onSelectPeriod }: CanvasSectionProps & { here: ActivityHere }) => (
  <>
    <CanvasActivityOwner owner={here.owner} />
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">Maintenant</h3>
      <NowBlock here={here} />
    </section>
    <div className="lp-window-split">
      <section className="lp-setting">
        <h3 className="lp-type-title lp-window-subhead">L'audience</h3>
        <StatTable
          caption="L'audience de cette fresque, aujourd'hui et sur les 30 derniers jours"
          columns={AUDIENCE_COLUMNS}
          rows={toCanvasAudienceRows(here.audience)}
        />
      </section>
      <section className="lp-setting">
        <h3 className="lp-type-title lp-window-subhead">Qui est là</h3>
        <ConnectedAccounts
          accounts={toActivityAccounts(here.accounts, nowMs)}
          guestsLine={toGuestsLine(here.guests)}
          emptyText="Personne sur cette fresque en ce moment."
        />
      </section>
    </div>
    <section className="lp-setting">
      <h3 className="lp-type-title lp-window-subhead">L'historique</h3>
      <HistoryBlock
        view={view}
        onSelectPeriod={onSelectPeriod}
        toChart={toChart}
        emptyText="Aucune activité sur cette fresque sur cette période."
        unavailableText="L'historique de cette fresque n'est pas disponible."
      />
    </section>
  </>
);

export const CanvasSection = ({ view, nowMs, onSelectPeriod }: CanvasSectionProps) => (
  <div className="lp-window-layout">
    {!view.activity && LOADING}
    {view.activity && !view.activity.here && (
      <span className="lp-type-body lp-muted">
        Les chiffres de cette fresque ne sont pas disponibles pour l'instant.
      </span>
    )}
    {view.activity?.here && (
      <HereBlocks here={view.activity.here} view={view} nowMs={nowMs} onSelectPeriod={onSelectPeriod} />
    )}
  </div>
);
