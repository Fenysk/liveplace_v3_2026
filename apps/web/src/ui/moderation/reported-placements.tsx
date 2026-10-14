// Les signalements en attente, dans l'onglet Modération (CDC 2026, Signalement ; JOURNAL 2026-09-28) : une ligne par
// signalement (JOURNAL 2026-10-07), avec l'aperçu de son dessin entier, son auteur, le nombre de signalements, s'il
// est caché du stream, puis Effacer le dessin (ou les dessins), Bannir (sauf un modérateur nommé ici, Écart §5.4 JOURNAL
// 2026-10-08) ou Rétablir. L'affichage seul, nourri par `useReportsProps`.

import { EyeOff } from "lucide-react";
import { Badge } from "../design/badge";
import { Button } from "../design/button";
import { PixelPreview } from "../design/pixel-preview";
import { SkeletonRows, SkeletonSwap } from "../design/skeleton";
import { formatPlacedAgo } from "../inspection/placed-ago";
import { useLocale, useTexts } from "../locale/use-locale";
import { canBan } from "./can-ban";
import { ConnectionLost } from "./connection-lost";
import { MarkedProfile } from "./marked-profile";
import { MODERATION_TEXTS } from "./moderation-texts";
import type { CanvasPreviewProps } from "./moderation-window";
import { type PendingReport, pendingReportKey } from "./pending-reports";
import { RowFailure } from "./row-failure";

export type ReportList =
  | { status: "loading" }
  | { status: "ready"; reports: readonly PendingReport[] }
  | { status: "failed" };

export type ReportedPlacementsProps = {
  list: ReportList;
  approvingReportKey: string | null; // Rétablir attend sa réponse : la clé de la ligne
  failedReportKey?: string | null | undefined; // Rétablir a échoué : la ligne le dit, la liste reste (Écart §8.1, JOURNAL 2026-10-13)
  canvas: CanvasPreviewProps;
  nowMs: number; // pour la date relative
  onClear: (report: PendingReport) => void; // la fenêtre Effacer ses dessins, sur ceux de cette ligne
  onBan: (report: PendingReport) => void;
  onApprove: (report: PendingReport) => void; // sans confirmation : elle revient sur le stream
};

type ReportRowProps = Omit<ReportedPlacementsProps, "list"> & { report: PendingReport };

const ReportRow = ({
  report,
  approvingReportKey,
  failedReportKey,
  canvas,
  nowMs,
  onClear,
  onBan,
  onApprove,
}: ReportRowProps) => {
  const locale = useLocale();
  const t = useTexts(MODERATION_TEXTS);
  const hasSeveralPlacements = report.placementIds.length > 1;
  return (
    <div className="lp-report lp-arrives">
      <div className="lp-report-preview">
        <PixelPreview
          {...canvas}
          pixels={report.pixels}
          label={t.reportedPlacementPreview({ hasSeveral: hasSeveralPlacements, name: report.displayName })}
        />
      </div>
      <div className="lp-report-body">
        <MarkedProfile user={report} hasAccount={report.hasAccount} />
        <span className="lp-row lp-type-caption lp-muted">
          {t.reportCount(report.reportCount)} · {formatPlacedAgo(report.reportedAt, nowMs, locale)}
          {report.isOffStream && <Badge label={t.hiddenFromStream} icon={EyeOff} />}
        </span>
        <div className="lp-row lp-report-actions">
          <Button
            label={t.clearPlacements[hasSeveralPlacements ? "several" : "one"]}
            onPress={() => onClear(report)}
          />
          {canBan(report) && <Button label={t.ban} variant="danger" onPress={() => onBan(report)} />}
          <Button
            label={t.restore}
            variant="ghost"
            isDisabled={approvingReportKey === pendingReportKey(report)}
            onPress={() => onApprove(report)}
          />
        </div>
        <RowFailure
          isFailed={failedReportKey === pendingReportKey(report)}
          onRetry={() => onApprove(report)}
        />
      </div>
    </div>
  );
};

const ReportRows = ({ list, ...rowProps }: ReportedPlacementsProps) => {
  const t = useTexts(MODERATION_TEXTS);
  // `failed` : rien, `ConnectionLost` le dit juste après.
  return (
    <SkeletonSwap
      isLoading={list.status === "loading"}
      skeleton={<SkeletonRows kind="profile" />}
      hasOwnArrival
    >
      {list.status === "ready" &&
        (list.reports.length === 0 ? (
          <span className="lp-type-caption lp-muted">{t.noReports}</span>
        ) : (
          list.reports.map((report) => (
            <ReportRow key={pendingReportKey(report)} report={report} {...rowProps} />
          ))
        ))}
    </SkeletonSwap>
  );
};

export const ReportedPlacements = (props: ReportedPlacementsProps) => {
  const t = useTexts(MODERATION_TEXTS);
  return (
    <>
      <span className="lp-type-body">{t.reports}</span>
      <ReportRows {...props} />
      <ConnectionLost isFailed={props.list.status === "failed"} />
    </>
  );
};
