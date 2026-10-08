// L'usage du mois d'un déploiement Convex (Écart §2 et §9, JOURNAL 2026-10-07), par l'API de déploiement que la CLI appelle :
// `GET /api/v1/get_current_usage`, `Authorization: Convex <clé>`. L'API est en bêta : une forme inconnue est un échec dit en
// quelques mots, jamais un plantage. La clé et l'adresse ne sont ni gardées ni journalisées, pas même dans le message d'une erreur.
// Le stock de fichiers (JOURNAL 2026-10-08) n'y figure pas : le compteur que tient Convex (`usage:files`, une fonction interne)
// se lit par `POST /api/query`, avec la même clé, comme le fait `ConvexHttpClient.setAdminAuth`.

import type { ConvexDeployment, ConvexUsageSource } from "@liveplace/domain/ports";
import type { Result } from "@liveplace/shared";
import { z } from "zod";

const USAGE_PATH = "/api/v1/get_current_usage";
const QUERY_PATH = "/api/query";
const FILES_FUNCTION = "usage:files";
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

// Ce que rend `usage:files` : `{ status: "success", value: { bytes, count } }`.
const FilesResponseSchema = z
  .object({ status: z.literal("success"), value: z.object({ bytes: z.number().nonnegative() }) })
  .transform(({ value }) => value.bytes);

// Un appel au déploiement avec sa clé : un échec se dit en quelques mots, sans la clé ni l'adresse.
async function call<Output>(
  { url, key }: ConvexDeployment,
  path: string,
  init: RequestInit,
  schema: z.ZodType<Output>,
): Promise<Result<Output>> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Convex ${key}`);
  let response: Response;
  try {
    response = await fetch(new URL(path, url), { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    // Le nom de l'erreur seul : son message peut citer l'adresse.
    return { ok: false, error: `injoignable (${error instanceof Error ? error.name : "inconnu"})` };
  }
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "forme de réponse inconnue" };
}

export function createConvexUsageSource(deployment: ConvexDeployment): ConvexUsageSource {
  return {
    name: deployment.name,

    async getUsage() {
      const result = await call(deployment, USAGE_PATH, {}, UsageResponseSchema);
      if (!result.ok) return result;
      const { metrics } = result.value;
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

    getFilesBytes: () =>
      call(
        deployment,
        QUERY_PATH,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: FILES_FUNCTION, args: {}, format: "json" }),
        },
        FilesResponseSchema,
      ),
  };
}
