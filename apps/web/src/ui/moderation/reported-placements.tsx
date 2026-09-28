// Les signalements en attente, dans l'onglet Modération (CDC 2026, Signalement ; JOURNAL 2026-09-28) : l'aperçu de
// la pose, son auteur, le nombre de signalements, si elle est cachée du stream, puis Retirer la pose, Bannir ou
// Rétablir. L'affichage seul, nourri par `useReportsProps`.

import type { ReportedPlacement } from "@liveplace/domain/ports";
import { EyeOff } from "lucide-react";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { formatPlacedAgo } from "../inspection/placed-ago";
import { MarkedProfile } from "./marked-profile";
import { CONNECTION_LOST, reportCountLabel } from "./moderation-texts";
import type { CanvasPreviewProps } from "./moderation-window";

export type ReportList =
  | { status: "loading" }
  | { status: "ready"; reports: readonly ReportedPlacement[] }
  | { status: "failed" };

export type ReportedPlacementsProps = {
  list: ReportList;
  approvingPlacementId: string | null; // Rétablir attend sa réponse
  canvas: CanvasPreviewProps;
  nowMs: number; // pour la date relative
  onClear: (report: ReportedPlacement) => void; // la fenêtre Retirer ses pixels, sur cette pose
  onBan: (report: ReportedPlacement) => void;
  onApprove: (report: ReportedPlacement) => void; // sans confirmation : elle revient sur le stream
};

type ReportRowProps = Omit<ReportedPlacementsProps, "list"> & { report: ReportedPlacement };

const ReportRow = ({
  report,
  approvingPlacementId,
  canvas,
  nowMs,
  onClear,
  onBan,
  onApprove,
}: ReportRowProps) => (
  <div className="lp-report">
    <div className="lp-report-preview">
      <PixelPreview {...canvas} pixels={report.pixels} label={`La pose signalée de ${report.displayName}`} />
    </div>
    <div className="lp-report-body">
      <MarkedProfile user={report} isFromTwitch={false} hasAccount={report.hasAccount} />
      <span className="lp-row lp-type-caption lp-muted">
        {reportCountLabel(report.reportCount)} · {formatPlacedAgo(report.reportedAt, nowMs)}
        {report.isOffStream && <Badge label="Cachée du stream" icon={EyeOff} />}
      </span>
      <div className="lp-row lp-report-actions">
        <Button label="Retirer la pose" onPress={() => onClear(report)} />
        <Button label="Bannir" variant="danger" onPress={() => onBan(report)} />
        <Button
          label="Rétablir"
          variant="ghost"
          isDisabled={approvingPlacementId === report.placementId}
          onPress={() => onApprove(report)}
        />
      </div>
    </div>
  </div>
);

const listContent = ({ list, ...rowProps }: ReportedPlacementsProps) => {
  if (list.status === "loading") return <span className="lp-type-caption lp-muted">Chargement…</span>;
  if (list.status === "failed") return <span className="lp-type-caption lp-danger">{CONNECTION_LOST}</span>;
  if (list.reports.length === 0)
    return <span className="lp-type-caption lp-muted">Aucun signalement en attente.</span>;
  return list.reports.map((report) => (
    <ReportRow key={`${report.userId}:${report.placementId}`} report={report} {...rowProps} />
  ));
};

export const ReportedPlacements = (props: ReportedPlacementsProps) => (
  <>
    <span className="lp-type-body">Signalements</span>
    {listContent(props)}
  </>
);
