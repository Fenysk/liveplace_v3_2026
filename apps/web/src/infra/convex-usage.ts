// L'usage du mois d'un déploiement Convex (Écart §2 et §9, JOURNAL 2026-10-07), par l'API de déploiement que la CLI appelle :
// `GET /api/v1/get_current_usage`, `Authorization: Convex <clé>`. L'API est en bêta : une forme inconnue est un échec dit en
// quelques mots, jamais un plantage. La clé et l'adresse ne sont ni gardées ni journalisées, pas même dans le message d'une erreur.

import type { ConvexDeployment, ConvexUsageSource } from "@liveplace/domain/ports";
import { z } from "zod";

const USAGE_PATH = "/api/v1/get_current_usage";
const TIMEOUT_MS = 10_000;

// Le mois en cours d'une métrique. Les périodes sont des clés de Convex en snake_case (`current_month`) : lues par leur nom,
// jamais déclarées ici.
const MonthSchema = z
  .object({ usage: z.record(z.string(), z.unknown()) })
  .transform(({ usage }) => usage.current_month)
  .pipe(z.number().nonnegative());

// Les seules métriques que lit la capacité ; le reste de la réponse (la requête, la recherche, `seedStatus`…) passe sans être lu.
const UsageResponseSchema = z.object({
  metrics: z.object({
    functionCalls: MonthSchema,
    databaseIoGb: MonthSchema,
    dataEgressGb: MonthSchema,
    actionComputeConvexGbHours: MonthSchema,
    actionComputeNodeJsGbHours: MonthSchema,
    actionComputeCpuGbHours: MonthSchema,
  }),
});

export function createConvexUsageSource({ name, url, key }: ConvexDeployment): ConvexUsageSource {
  return {
    name,
    async getUsage() {
      const headers = new Headers();
      headers.set("Authorization", `Convex ${key}`);
      let response: Response;
      try {
        response = await fetch(new URL(USAGE_PATH, url), {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        // Le nom de l'erreur seul : son message peut citer l'adresse.
        return { ok: false, error: `injoignable (${error instanceof Error ? error.name : "inconnu"})` };
      }
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
      const parsed = UsageResponseSchema.safeParse(await response.json().catch(() => undefined));
      if (!parsed.success) return { ok: false, error: "forme de réponse inconnue" };
      const { metrics } = parsed.data;
      return {
        ok: true,
        value: {
          calls: metrics.functionCalls,
          databaseIoGb: metrics.databaseIoGb,
          egressGb: metrics.dataEgressGb,
          computeGbHours:
            metrics.actionComputeConvexGbHours +
            metrics.actionComputeNodeJsGbHours +
            metrics.actionComputeCpuGbHours,
        },
      };
    },
  };
}
