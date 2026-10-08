// Ce que le web dépose pour la capacité (Écart §2 et §9, JOURNAL 2026-10-07) : son occupation toutes les 10 s, l'usage de
// chaque déploiement Convex toutes les 15 minutes, et une fois au démarrage. Le gateway ne parle jamais à Convex (§2) :
// il lit ce dépôt dans Redis. Une minuterie ne plante jamais le serveur : un échec se journalise et la suivante passe.

import type { Timestamp } from "@liveplace/domain";
import { CAPACITY_SAMPLE_MS, CONVEX_USAGE_MS } from "@liveplace/domain/capacity";
import type { CapacityWrites, ConvexUsageSource } from "@liveplace/domain/ports";

export type CapacityReportDeps = {
  writes: CapacityWrites;
  now: () => Timestamp;
  getUtilizationPercent: () => number; // l'occupation du web depuis le dernier appel
  sources: readonly ConvexUsageSource[]; // aucune : Convex n'est pas configuré
  repeat: (ms: number, run: () => Promise<void>) => void;
};

export interface CapacityReport {
  reportUtilization(): Promise<void>;
  reportConvexUsage(): Promise<void>;
  start(): Promise<void>; // lance les deux minuteries, et attend la première lecture de Convex
}

export function createCapacityReport(deps: CapacityReportDeps): CapacityReport {
  const reportUtilization = async (): Promise<void> => {
    await deps.writes.storeWebUtilization({ at: deps.now(), utilization: deps.getUtilizationPercent() });
  };

  // Un déploiement qui échoue ne retient pas les autres : sa lecture vieillit, et le gateway dira « sans nouvelles ». Son stock de
  // fichiers se lit à part : s'il manque, l'usage du mois se dépose sans lui et seule sa ligne vieillit.
  const reportConvexUsage = async (): Promise<void> => {
    if (deps.sources.length === 0) return deps.writes.storeConvexUnconfigured();
    await Promise.all(
      deps.sources.map(async (source) => {
        const [usage, files] = await Promise.all([source.getUsage(), source.getFilesBytes()]);
        if (!usage.ok)
          return console.error(`web: capacité, usage de Convex non lu pour ${source.name} : ${usage.error}`);
        if (!files.ok)
          console.error(
            `web: capacité, stockage des fichiers de Convex non lu pour ${source.name} : ${files.error}`,
          );
        await deps.writes.storeConvexUsage(source.name, {
          at: deps.now(),
          ...usage.value,
          ...(files.ok ? { filesBytes: files.value } : {}),
        });
      }),
    );
  };

  const guarded = (message: string, run: () => Promise<void>) => async (): Promise<void> => {
    try {
      await run();
    } catch (error) {
      console.error(message, error);
    }
  };

  return {
    reportUtilization,
    reportConvexUsage,

    async start() {
      const utilization = guarded("web: capacité, occupation non déposée", reportUtilization);
      const convexUsage = guarded("web: capacité, usage de Convex non déposé", reportConvexUsage);
      deps.repeat(CAPACITY_SAMPLE_MS, utilization);
      deps.repeat(CONVEX_USAGE_MS, convexUsage);
      await convexUsage();
    },
  };
}
