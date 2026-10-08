// Les signalements en attente, dans l'onglet Modération (CDC 2026, Signalement ; JOURNAL 2026-09-28) : une ligne par
// signalement (JOURNAL 2026-10-07), avec l'aperçu de son dessin entier, son auteur, le nombre de signalements, s'il
// est caché du stream, puis Retirer la pose (ou les poses), Bannir (sauf un modérateur nommé ici, Écart §5.4 JOURNAL
// 2026-10-08) ou Rétablir. L'affichage seul, nourri par `useReportsProps`.

import { EyeOff } from "lucide-react";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { formatPlacedAgo } from "../inspection/placed-ago";
import { canBan } from "./can-ban";
import { MarkedProfile } from "./marked-profile";
import { CONNECTION_LOST, reportCountLabel } from "./moderation-texts";
import type { CanvasPreviewProps } from "./moderation-window";
import { type PendingReport, pendingReportKey } from "./pending-reports";

export type ReportList =
  | { status: "loading" }
  | { status: "ready"; reports: readonly PendingReport[] }
  | { status: "failed" };

export type ReportedPlacementsProps = {
  list: ReportList;
  approvingReportKey: string | null; // Rétablir attend sa réponse : la clé de la ligne
  canvas: CanvasPreviewProps;
  nowMs: number; // pour la date relative
  onClear: (report: PendingReport) => void; // la fenêtre Retirer ses pixels, sur les poses de cette ligne
  onBan: (report: PendingReport) => void;
  onApprove: (report: PendingReport) => void; // sans confirmation : elle revient sur le stream
};

type ReportRowProps = Omit<ReportedPlacementsProps, "list"> & { report: PendingReport };

const ReportRow = ({
  report,
  approvingReportKey,
  canvas,
  nowMs,
  onClear,
  onBan,
  onApprove,
}: ReportRowProps) => {
  const hasSeveralPlacements = report.placementIds.length > 1;
  return (
    <div className="lp-report">
      <div className="lp-report-preview">
        <PixelPreview
          {...canvas}
          pixels={report.pixels}
          label={`${hasSeveralPlacements ? "Les poses signalées" : "La pose signalée"} de ${report.displayName}`}
        />
      </div>
      <div className="lp-report-body">
        <MarkedProfile user={report} hasAccount={report.hasAccount} />
        <span className="lp-row lp-type-caption lp-muted">
          {reportCountLabel(report.reportCount)} · {formatPlacedAgo(report.reportedAt, nowMs)}
          {report.isOffStream && <Badge label="Cachée du stream" icon={EyeOff} />}
        </span>
        <div className="lp-row lp-report-actions">
          <Button
            label={hasSeveralPlacements ? "Retirer les poses" : "Retirer la pose"}
            onPress={() => onClear(report)}
          />
          {canBan(report) && <Button label="Bannir" variant="danger" onPress={() => onBan(report)} />}
          <Button
            label="Rétablir"
            variant="ghost"
            isDisabled={approvingReportKey === pendingReportKey(report)}
            onPress={() => onApprove(report)}
          />
        </div>
      </div>
    </div>
  );
};

const listContent = ({ list, ...rowProps }: ReportedPlacementsProps) => {
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">Chargement…</span>;
  if (list.status === "failed") return <span className="lp-type-caption lp-danger">{CONNECTION_LOST}</span>;
  if (list.reports.length === 0)
    return <span className="lp-type-caption lp-muted">Aucun signalement en attente.</span>;
  return list.reports.map((report) => (
    <ReportRow key={pendingReportKey(report)} report={report} {...rowProps} />
  ));
};

export const ReportedPlacements = (props: ReportedPlacementsProps) => (
  <>
    <span className="lp-type-body">Signalements</span>
    {listContent(props)}
  </>
);
