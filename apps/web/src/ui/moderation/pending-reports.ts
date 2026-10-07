// Une ligne par signalement : ses poses ont le même `reportedAt` (report.lua : ZADD NX, un seul nowMs) (JOURNAL 2026-10-07).

import type { ReportedPlacement } from "@liveplace/domain/ports";

// `placementId` : la première pose ; `placementIds` : toutes, la première d'abord.
export type PendingReport = ReportedPlacement & { placementIds: readonly string[] };

export const pendingReportKey = ({ userId, reportedAt }: ReportedPlacement): string =>
  `${userId}:${reportedAt}`;

type Placements = [ReportedPlacement, ...ReportedPlacement[]];

const toPendingReport = (placements: Placements): PendingReport => ({
  ...placements[0],
  placementIds: placements.map(({ placementId }) => placementId),
  reportCount: placements.reduce((highest, { reportCount }) => Math.max(highest, reportCount), 0),
  isOffStream: placements.some(({ isOffStream }) => isOffStream),
  pixels: placements.flatMap(({ pixels }) => pixels),
});

// Dans l'ordre reçu, une ligne par couple (auteur, heure du premier signalement), à sa première apparition.
export const toPendingReports = (reports: readonly ReportedPlacement[]): PendingReport[] => {
  const rows = new Map<string, Placements>();
  for (const report of reports) {
    const key = pendingReportKey(report);
    const placements = rows.get(key);
    if (placements) placements.push(report);
    else rows.set(key, [report]);
  }
  return [...rows.values()].map(toPendingReport);
};
